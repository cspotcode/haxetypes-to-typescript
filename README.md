About
---

Use Haxe libraries in your TypeScript projects.  Create TypeScript definition files (`.d.ts`) for Haxe code, allowing you to use the Haxe-compiled-to-JavaScript from TypeScript files.

Info
---

This code converts Haxe XML type information (from the Haxe compiler) into a TypeScript definition file.

It is mostly generic, but has been purpose-built to generate type info for the Nape physics engine, compiled to
JavaScript using my [nape-to-js](https://github.com/cspotcode/nape-to-js) build script/JS generator.  Thus there are one or two special-cases in the code
to make it work for Nape specifically.

Also, the generated JS must have property getters and setters, meaning the code will only run on JavaScript engines that
support those.  Again, this was purpose-built for using Nape physics in a project that will only run on newer JS VMs.

Creating Haxe Type Information
---

Run the Haxe compiler with the `-xml` flag.

```
haxe -cp src -xml type-info.xml
```

Converting Haxe Type Info into a TypeScript Definition File
---

Compile this converter (one-time only):

```
# if you haven't already, install dependencies
npm install
# download TypeScript definitions
node_modules/.bin/tsd install*
# if you haven't already, install the TypeScript compiler
npm install tsc -g
# compile
tsc src/index.ts
```

Run this converter, specifing the appropriate input and output files:

```
node src/index.js -i type-info.xml -o output.d.ts
```

TODOs / Unimplemented Features
---

* Does not output Typedefs
* Does not output anonymous structural types
* Does not deal with generics; can be added once TypeScript supports them (already in 0.9 early release)
