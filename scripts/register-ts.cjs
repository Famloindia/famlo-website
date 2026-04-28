const fs = require("node:fs");
const ts = require("typescript");

function compileTs(sourceText, filename) {
  const result = ts.transpileModule(sourceText, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      sourceMap: false,
      inlineSourceMap: false,
    },
  });

  return result.outputText;
}

function registerExtension(ext) {
  require.extensions[ext] = (mod, filename) => {
    const sourceText = fs.readFileSync(filename, "utf8");
    const outputText = compileTs(sourceText, filename);
    mod._compile(outputText, filename);
  };
}

registerExtension(".ts");
registerExtension(".tsx");

