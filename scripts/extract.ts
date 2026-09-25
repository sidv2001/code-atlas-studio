import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type {
  AtlasGraph,
  AtlasNode,
  ImportEdge,
  Position,
  SourceRange,
  UnresolvedImport,
} from "../src/types.ts";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const maxFiles = 160;
const maxFileBytes = 512 * 1024;
const maxTotalBytes = 4 * 1024 * 1024;

function repositoryPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function collectSourceFiles(root: string): string[] {
  const pending = [root];
  const files: string[] = [];

  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        pending.push(absolutePath);
      } else if (
        entry.isFile() &&
        /\.(?:ts|tsx|mts|cts)$/.test(entry.name) &&
        !/\.d\.(?:ts|mts|cts)$/.test(entry.name)
      ) {
        files.push(absolutePath);
        if (files.length > maxFiles) {
          throw new Error(`Input exceeds the ${maxFiles}-file starter limit.`);
        }
      }
    }
  }

  return files.sort();
}

function position(sourceFile: ts.SourceFile, offset: number): Position {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
  return { line: line + 1, column: character + 1 };
}

function range(
  sourceFile: ts.SourceFile,
  repoPath: string,
  start: number,
  end: number,
): SourceRange {
  return {
    path: repoPath,
    start: position(sourceFile, start),
    end: position(sourceFile, end),
  };
}

function nodeRange(
  sourceFile: ts.SourceFile,
  repoPath: string,
  node: ts.Node,
): SourceRange {
  return range(sourceFile, repoPath, node.getStart(sourceFile), node.getEnd());
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
      true
  );
}

function containsJsx(node: ts.Node): boolean {
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    return true;
  }
  return ts.forEachChild(node, containsJsx) === true;
}

function callableKind(
  name: string,
  declaration: ts.Node,
): "component" | "function" {
  return /^[A-Z][A-Za-z0-9]*$/.test(name) && containsJsx(declaration)
    ? "component"
    : "function";
}

function exportedDeclarations(
  sourceFile: ts.SourceFile,
  repoPath: string,
  fileId: string,
): AtlasNode[] {
  const nodes: AtlasNode[] = [];

  function add(name: string, kind: AtlasNode["kind"], node: ts.Node): void {
    nodes.push({
      id: `symbol:${repoPath}:${node.getStart(sourceFile)}`,
      kind,
      label: name,
      parentId: fileId,
      provenance: "extracted",
      source: nodeRange(sourceFile, repoPath, node),
    });
  }

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;

    if (ts.isClassDeclaration(statement) && statement.name) {
      add(statement.name.text, "class", statement);
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      add(
        statement.name.text,
        callableKind(statement.name.text, statement),
        statement,
      );
    } else if (ts.isInterfaceDeclaration(statement)) {
      add(statement.name.text, "interface", statement);
    } else if (ts.isTypeAliasDeclaration(statement)) {
      add(statement.name.text, "type", statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          add(
            declaration.name.text,
            callableKind(declaration.name.text, declaration.initializer),
            declaration,
          );
        }
      }
    }
  }

  return nodes;
}

export function extractRepository(rootPath: string): AtlasGraph {
  const root = realpathSync(rootPath);
  if (!statSync(root).isDirectory()) {
    throw new Error(`Expected a directory: ${rootPath}`);
  }

  const files = collectSourceFiles(root);
  if (files.length === 0) {
    throw new Error("No TypeScript source files found in the selected directory.");
  }
  let totalBytes = 0;
  for (const file of files) {
    const bytes = statSync(file).size;
    totalBytes += bytes;
    if (bytes > maxFileBytes || totalBytes > maxTotalBytes) {
      throw new Error(
        `Input exceeds the starter limit (${maxFileBytes} bytes per file, ${maxTotalBytes} bytes total).`,
      );
    }
  }

  const compilerOptions: ts.CompilerOptions = {
    noEmit: true,
    noLib: true,
    noResolve: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
  };
  const program = ts.createProgram(files, compilerOptions);
  const indexedFiles = new Set(files);
  const directories = [...new Set(files.map((file) => path.dirname(repositoryPath(root, file))))].sort();
  const nodes: AtlasNode[] = directories.map((directory) => ({
    id: `module:${directory}`,
    kind: "module",
    label: directory === "." ? "root" : directory,
    parentId: null,
    provenance: "curated",
    description: "Files grouped by directory; not a runtime boundary.",
  }));
  const edges: ImportEdge[] = [];
  const unresolvedRelativeImports: UnresolvedImport[] = [];
  let unmappedBareImports = 0;

  for (const file of files) {
    const repoPath = repositoryPath(root, file);
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) throw new Error(`Unable to read ${repoPath}.`);

    const syntaxError = program.getSyntacticDiagnostics(sourceFile)[0];
    if (syntaxError) {
      const at = position(sourceFile, syntaxError.start ?? 0);
      throw new Error(
        `Unable to parse ${repoPath}:${at.line}:${at.column}: ${ts.flattenDiagnosticMessageText(syntaxError.messageText, " ")}`,
      );
    }

    const fileId = `file:${repoPath}`;
    nodes.push({
      id: fileId,
      kind: "file",
      label: path.basename(repoPath),
      parentId: `module:${path.dirname(repoPath)}`,
      provenance: "extracted",
      source: range(sourceFile, repoPath, 0, sourceFile.text.length),
    });
    nodes.push(...exportedDeclarations(sourceFile, repoPath, fileId));

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) {
        unmappedBareImports += 1;
        continue;
      }

      const source = nodeRange(sourceFile, repoPath, statement);
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        compilerOptions,
        ts.sys,
      ).resolvedModule?.resolvedFileName;
      if (!resolved || !indexedFiles.has(resolved)) {
        unresolvedRelativeImports.push({ from: fileId, specifier, source });
        continue;
      }
      edges.push({
        id: `import:${repoPath}:${statement.getStart(sourceFile)}`,
        from: fileId,
        to: `file:${repositoryPath(root, resolved)}`,
        kind: "imports",
        provenance: "extracted",
        source,
      });
    }
  }

  return {
    schemaVersion: 1,
    repository: { name: path.basename(root) },
    analysis: { fileCount: files.length, unmappedBareImports, unresolvedRelativeImports },
    nodes,
    edges,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) {
      throw new Error("Usage: npm run extract -- [path-to-local-typescript-directory]");
    }
    const root = process.argv[2] ?? "examples/parcelboard";
    process.stdout.write(`${JSON.stringify(extractRepository(root), null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
