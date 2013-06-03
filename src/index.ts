/// <reference path="../typings/DefinitelyTyped/node/node.d.ts"/>
/// <reference path="sample.d.ts"/>

var xmldoc = require('xmldoc');
import fs = module('fs');
var nomnom = require('nomnom');

var cliParser = nomnom();
cliParser
    .option('input', {
        abbr: 'i',
        required: true,
        help: 'input file',
        meta: 'INPUT'
    })
    .option('output', {
        abbr: 'o',
        required: true,
        help: 'output file',
        meta: 'OUTPUT'
    });

var opts = cliParser.parse();

var document = new xmldoc.XmlDocument(fs.readFileSync(opts.input, 'utf-8'));

enum HaxeTypeKind {
    DYNAMIC,
    FUNCTION,
    ANONYMOUS,
    CLASS,
    NORMAL
}

interface HaxeType {
    path: string;
    name: string;
    kind: HaxeTypeKind;
    isArray?: bool;
};

interface HaxePrimitiveType extends HaxeType {
    path: string;
};

interface HaxeClass extends HaxeType {
    parent: string;
    methods: HaxeMethod[];
    fields: HaxeField[];
    staticMethods: HaxeMethod[];
    staticFields: HaxeField[];
}

interface HaxeFunction extends HaxeType {
    args: HaxeArgument[];
    returnType: HaxeType;
}

interface HaxeMethod {
    name: string;
    isPublic: bool;
    type: HaxeFunction;
}

interface HaxeArgument {
    name: string;
    type: HaxeType;
    optional: bool;
}

interface HaxeField {
    name: string;
    type: HaxeType;
    isPublic: bool;
}

var types:{
    [i: string]: HaxeType;
} = {};

var createTypeFromTypeElem = function(elem):HaxeType => {
    // When Haxe says Null<T> we discard the Null and just say T.  Everything in Typescript is nullable
    if(elem.name === 't' && elem.attr['path'] === 'Null') elem = elem.children[0];
    // When Haxe says nape.TArray<T>, we say T[]
    var isArray = false;
    if(elem.attr['path'] === 'nape.TArray') {
        isArray = true;
        elem = elem.children[0];
    }
    // TODO implement creation of anonymous types and anonymous function (signature?) types
    var path = (elem.name === 'a' || elem.name === 'd' || elem.name === 'f') ? null : elem.attr['path'];
    var name = path ? path.split('.').slice(-1)[0] : null;
    if(elem.name === 'f') {
        var argNames:string[] = elem.attr['a'].split(':');
        var lastNonOptionalArg = -1;
        var args:HaxeArgument[] = elem.children.slice(0, -1).map((typeElem, i) => {
            var optional = argNames[i][0] === '?';
            if(!optional) lastNonOptionalArg = i;
            return {
                name: argNames[i].replace(/^\?/, ''),
                type: createTypeFromTypeElem(typeElem),
                optional: optional
            };
        });
        // Typescript doesn't allow optional arguments to come before non-optional ones
        for(var i = 0; i <= lastNonOptionalArg; i++) {
            args[i].optional = false;
        }
        var returnType = createTypeFromTypeElem(elem.children.slice(-1)[0]);
        var fnType:HaxeFunction = {
            args: args,
            returnType: returnType,
            kind: HaxeTypeKind.FUNCTION,
            path: null,
            name: null
        };
        return fnType;
    };
    return {
        path: path,
        name: name,
        kind: elem.name === 'd' ? HaxeTypeKind.DYNAMIC : elem.name === 'a' ? HaxeTypeKind.ANONYMOUS : HaxeTypeKind.NORMAL,
        isArray: isArray
    };
};

document.eachChild((elem) => {
    if(elem.name !== 'class') {
        console.log('element with name: ' + elem.name);
        return;
    }

    // Create a new class
    var newClass:HaxeClass = {
        path: elem.attr['path'],
        name: elem.attr['path'].split('.').slice(-1)[0],
        methods: [],
        fields: [],
        staticMethods: [],
        staticFields: [],
        parent: null,
        kind: HaxeTypeKind.CLASS
    };

    // for each child of the class element
    elem.eachChild((elem) => {
        switch(elem.name) {
            case 'extends':
                newClass.parent = elem.attr['path'];
                break;

            case 'haxe_doc':
            case 'meta':
                // Skip these for now
                break;

            default:
                // Assume this is either a method or a field
                var isStatic = elem.attr['static'] === '1';
                var isPublic = elem.attr['public'] === '1';
                if(elem.attr['set'] === 'method') {
                    // Create a method
                    var fElem = elem.childNamed('f');
                    var type = createTypeFromTypeElem(fElem);
                    var newMethod:HaxeMethod = {
                        name: elem.name,
                        isPublic: isPublic,
                        type: type
                    };
                    // Add the method to the class
                    if(isStatic) {
                        newClass.staticMethods.push(newMethod);
                    } else {
                        newClass.methods.push(newMethod);
                    }
                } else {
                    // it's a class field
                    var newField:HaxeField = {
                        name: elem.name,
                        isPublic: isPublic,
                        type: createTypeFromTypeElem(elem.children[0])
                    };
                    if(isStatic) {
                        newClass.staticFields.push(newField);
                    } else {
                        newClass.fields.push(newField);
                    }
                }
        }
    });

    types[newClass.path] = newClass;
});

class Package {

    public name: string;
    parent: Package;
    public childPackages: {
        [i: string]: Package;
    };
    public childTypes: {
        [i: string]: HaxeType;
    };

    constructor(name:string, parent:Package) {
        this.name = name;
        this.parent = parent;
        this.childPackages = {};
        this.childTypes = {};
        if(this.parent) {
            this.parent.addChildPackage(this);
        }
    }

    addChildPackage(child:Package):void {
        this.childPackages[child.name] = child;
    }

    getChildPackage(name: string, create?: bool = false):Package {
        var child = this.childPackages[name];
        if(!child && create) child = this.childPackages[name] = new Package(name, this);
        return child;
    }

    getChildPackages():Package[] {
        return Object.keys(this.childPackages).map((v) => this.childPackages[v]);
    }

    addChildType(child:HaxeType):void {
        this.childTypes[child.name] = child;
    }

    getChildTypes():HaxeType[] {
        return Object.keys(this.childTypes).map((v) => this.childTypes[v]);
    }
}

var rootPackage = new Package(null, null);

Object.keys(types).forEach((name) => {
    var type:HaxeType = types[name];
    var pathComponents = type.path.split('.');
    var typeName = pathComponents.pop();
    var owningPackage = rootPackage;
    pathComponents.forEach((v) => {
        owningPackage = owningPackage.getChildPackage(v, true);
    });
    owningPackage.addChildType(type);
});

var buffer:string[] = [];
var indentationLevel = 0;
var indent = function() {
    indentationLevel++;
};
var outdent = function() {
    indentationLevel--;
};
var print = function(str: string) {
    buffer.push(str);
};
var printIndent = function() {
    for(var i = 0 ; i < indentationLevel; i++) {
        print('    ');
    }
};

var printPackage = function(pkg:Package) {
    printIndent();
    pkg.parent.name === null ? print('declare module "' + pkg.name + '"') : print('export module ' + pkg.name);
    print(' {\n');
    indent();
    // TODO this is an ugly special-case
    if(pkg.name === 'nape' || pkg.name === 'zpp_nape') {
        printIndent();
        print('import zpp_nape = module("zpp_nape");\n');
        printIndent();
        print('import nape = module("nape");\n');
    }
    if(pkg.name === 'sandbox') {
        printIndent();
        print('import sandbox = module("sandbox");\n');
    }
    pkg.getChildPackages().forEach((pkg:Package) => printPackage(pkg));
    pkg.getChildTypes().forEach((type:HaxeType) => printType(type));
    outdent();
    printIndent();
    print('}\n');
};

var printType = function(type:HaxeType) {
    printIndent();
    print('export ');
    var isClass = type.kind === HaxeTypeKind.CLASS;
    isClass ? print('class') : print('var');
    print(' ' + type.name);
    if(isClass) {
        var classType: HaxeClass = <HaxeClass>type;
        if(classType.parent) {
            print(' extends ' + classType.parent);
        }
        print(' {\n');
        indent();
        classType.fields.forEach((field:HaxeField) => {
            if(field.isPublic) {
                printIndent();
                print('public ' + field.name + ': ');
                printType2(field.type);
                print(';\n');
            }
        });
        classType.staticFields.forEach((field:HaxeField) => {
            if(field.isPublic) {
                printIndent();
                print('public static ' + field.name + ': ');
                printType2(field.type);
                print(';\n');
            }
        });
        classType.methods.forEach((method:HaxeMethod) => {
            if(method.isPublic) {
                printIndent();
                var isConstructor = method.name === 'new';
                if(isConstructor) {
                    print('constructor(');
                } else {
                    print('public ' + method.name + '(');
                }
                method.type.args.forEach((arg:HaxeArgument, i: number) => {
                    if(i) print(', ');
                    print((arg.name || '__' + i) + (arg.optional ? '?' : '') + ': ');
                    printType2(arg.type);
                });
                print(')');
                if(!isConstructor) {
                    print(': ');
                    printType2(method.type.returnType);
                }
                print(';\n');
            }
        });
        outdent();
        printIndent();
        print('}\n');
    } else {
        print(': TODOTODOTODO;\n');
    }
};

// TODO gonna need better names for these functions
var printType2 = function(type: HaxeType) {
    switch(type.kind) {
        case HaxeTypeKind.FUNCTION:
            var fnType = <HaxeFunction>type;
            print('(');
            fnType.args.forEach((arg: HaxeArgument, i: number) => {
                if(i) print(', ');
                print((arg.name || '__' + i) + ': ');
                printType2(arg.type);
            });
            print(') => ');
            printType2(fnType.returnType);
            break;

        case HaxeTypeKind.DYNAMIC:
            print('any');
            if(type.isArray) print('[]');
            break;

        case HaxeTypeKind.NORMAL:
            print(typeReplacements[type.path] || type.path);
            if(type.isArray) print('[]');
            break;

        default:
            throw new Error('Can\'t handle outputting type information for ' + type.kind);
    }
};

var typeReplacements: {[i: string]: string;} = {
    'Float': 'number',
    'Int': 'number',
    'Bool': 'bool',
    'Void': 'void'
};

rootPackage.getChildPackages().forEach((pkg:Package) => {
    // Reject non-nape packages
    if(pkg.name !== 'nape' && pkg.name !== 'zpp_nape') return;
    printPackage(pkg);
});

fs.writeFileSync(opts.output, buffer.join(''));
