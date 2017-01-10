"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const assert = require("assert");
const io_1 = require("../util/io");
const util_1 = require("../util/util");
const common_1 = require("./common");
const versions_1 = require("./versions");
class AllPackages {
    constructor(data, notNeeded) {
        this.data = data;
        this.notNeeded = notNeeded;
    }
    static read(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const map = yield readData();
            const notNeeded = (yield readNotNeededPackages(options)).map(raw => new NotNeededPackage(raw));
            return new AllPackages(map, notNeeded);
        });
    }
    static readTypings() {
        return __awaiter(this, void 0, void 0, function* () {
            return Array.from(flattenData(yield readData()));
        });
    }
    /** Use for `--single` tasks only. Do *not* call this in a loop! */
    static readSingle(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield readTypesDataFile();
            const raw = data[name];
            if (!raw) {
                throw new Error(`Can't find package ${name}`);
            }
            const versions = Object.keys(raw);
            if (versions.length > 1) {
                throw new Error(`Package ${name} has multiple versions.`);
            }
            return new TypingsData(raw[versions[0]], /*isLatest*/ true);
        });
    }
    getAnyPackage(id) {
        const pkg = this.tryGetTypingsData(id) || this.notNeeded.find(p => p.name === id.name);
        if (!pkg) {
            throw new Error(`Expected to find a package named ${id.name}`);
        }
        return pkg;
    }
    hasTypingFor(dep) {
        return this.tryGetTypingsData(dep) !== undefined;
    }
    getLatestVersion(packageName) {
        const versions = this.data.get(packageName);
        if (!versions) {
            throw new Error(`No such package ${packageName}.`);
        }
        return versions.getLatest();
    }
    getTypingsData(id) {
        const pkg = this.tryGetTypingsData(id);
        if (!pkg) {
            throw new Error(`No typings available for ${id}`);
        }
        return pkg;
    }
    tryGetTypingsData({ name, majorVersion }) {
        const versions = this.data.get(name);
        if (!versions) {
            return undefined;
        }
        return versions.get(majorVersion);
    }
    allPackages() {
        return this.allTypings().concat(this.allNotNeeded());
    }
    allTypings() {
        return Array.from(flattenData(this.data));
    }
    allNotNeeded() {
        return this.notNeeded;
    }
    /** Returns all of the dependences *that have typings*, ignoring others. */
    *dependencyTypings(pkg) {
        for (const { name, majorVersion } of pkg.dependencies) {
            const versions = this.data.get(name);
            if (versions) {
                yield versions.get(majorVersion);
            }
        }
    }
}
exports.AllPackages = AllPackages;
exports.typesDataFilename = "definitions.json";
function readData() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield readTypesDataFile();
        return util_1.mapValues(new Map(Object.entries(data)), raw => new TypingsVersions(raw));
    });
}
function* flattenData(data) {
    for (const versions of data.values()) {
        yield* versions.getAll();
    }
}
/** Prefer to use `AnyPackage` instead of this. */
class PackageBase {
    static compare(a, b) { return a.name.localeCompare(b.name); }
    /** Short description for debug output. */
    get desc() {
        return this.isLatest ? this.name : `${this.name} v${this.major}`;
    }
    constructor(data) {
        this.name = data.typingsPackageName;
        this.libraryName = data.libraryName;
        this.sourceRepoURL = data.sourceRepoURL;
    }
    isNotNeeded() {
        return this instanceof NotNeededPackage;
    }
    /** '@types/foo' for a package 'foo'. */
    get fullNpmName() {
        return fullNpmName(this.name);
    }
    /** '@types%2ffoo' for a package 'foo'. */
    get fullEscapedNpmName() {
        return `@${common_1.settings.scopeName}%2f${this.name}`;
    }
    get id() {
        return { name: this.name, majorVersion: this.major };
    }
    get outputDirectory() {
        return util_1.joinPaths(outputDir, this.desc);
    }
}
exports.PackageBase = PackageBase;
function fullNpmName(packageName) {
    return `@${common_1.settings.scopeName}/${packageName}`;
}
exports.fullNpmName = fullNpmName;
const outputDir = util_1.joinPaths(common_1.home, common_1.settings.outputPath);
class NotNeededPackage extends PackageBase {
    constructor(raw) {
        super(raw);
        for (const key in raw) {
            if (!["libraryName", "typingsPackageName", "sourceRepoURL", "asOfVersion"].includes(key)) {
                throw new Error(`Unexpected key in not-needed package: ${key}`);
            }
        }
        assert(raw.libraryName && raw.typingsPackageName && raw.sourceRepoURL && raw.asOfVersion);
        this.version = versions_1.Semver.parse(raw.asOfVersion, /*isPrerelease*/ false);
    }
    get major() { return this.version.major; }
    // A not-needed package has no other versions. (TODO: allow that?)
    get isLatest() { return true; }
    get isPrerelease() { return false; }
    get projectName() { return this.sourceRepoURL; }
    get declaredModules() { return []; }
    get globals() { return this.globals; }
    get typeScriptVersion() { return TypeScriptVersion.Lowest; }
    readme(useNewline = true) {
        const { libraryName, sourceRepoURL, name } = this;
        const lines = [
            `This is a stub types definition for ${libraryName} (${sourceRepoURL}).`,
            `${libraryName} provides its own type definitions, so you don't need ${fullNpmName(name)} installed!`
        ];
        return lines.join(useNewline ? "\n" : " ");
    }
}
exports.NotNeededPackage = NotNeededPackage;
class TypingsVersions {
    constructor(data) {
        const versions = Object.keys(data).map(Number);
        this.latest = Math.max(...versions);
        this.map = new Map(versions.map((version) => [version, new TypingsData(data[version], version === this.latest)]));
    }
    getAll() {
        return this.map.values();
    }
    get(majorVersion) {
        return majorVersion === "*" ? this.getLatest() : this.getExact(majorVersion);
    }
    getLatest() {
        return this.getExact(this.latest);
    }
    getExact(majorVersion) {
        const data = this.map.get(majorVersion);
        if (!data) {
            throw new Error(`Could not find version ${majorVersion}`);
        }
        return data;
    }
}
class TypingsData extends PackageBase {
    constructor(data, isLatest) {
        super(data);
        this.data = data;
        this.isLatest = isLatest;
    }
    get authors() { return this.data.authors; }
    get major() { return this.data.libraryMajorVersion; }
    get minor() { return this.data.libraryMinorVersion; }
    get majorMinor() { return { major: this.major, minor: this.minor }; }
    get typeScriptVersion() { return this.data.typeScriptVersion; }
    get files() { return this.data.files; }
    get hasPackageJson() { return this.data.hasPackageJson; }
    get contentHash() { return this.data.contentHash; }
    get declaredModules() { return this.data.declaredModules; }
    get projectName() { return this.data.projectName; }
    get globals() { return this.data.globals; }
    get isPrerelease() {
        return TypeScriptVersion.isPrerelease(this.typeScriptVersion);
    }
    get dependencies() {
        return this.deps();
    }
    *deps() {
        const raw = this.data.dependencies;
        for (const name in raw) {
            yield { name, majorVersion: raw[name] };
        }
    }
    /** Path to this package, *relative* to the DefinitelyTyped directory. */
    get subDirectoryPath() {
        return this.isLatest ? this.name : `${this.name}/v${this.data.libraryMajorVersion}`;
    }
    directoryPath(options) {
        return util_1.joinPaths(options.definitelyTypedPath, this.subDirectoryPath);
    }
    filePath(fileName, options) {
        return util_1.joinPaths(this.directoryPath(options), fileName);
    }
}
exports.TypingsData = TypingsData;
function readTypesDataFile() {
    return common_1.readDataFile("parse-definitions", exports.typesDataFilename);
}
function notNeededPackagesPath(options) {
    return util_1.joinPaths(options.definitelyTypedPath, "notNeededPackages.json");
}
function readNotNeededPackages(options) {
    return __awaiter(this, void 0, void 0, function* () {
        return (yield io_1.readJson(notNeededPackagesPath(options))).packages;
    });
}
/** Path to the *root* for a given package. Path to a particular version may differ. */
function packageRootPath(packageName, options) {
    return util_1.joinPaths(options.definitelyTypedPath, packageName);
}
exports.packageRootPath = packageRootPath;
var TypeScriptVersion;
(function (TypeScriptVersion) {
    TypeScriptVersion.All = ["2.0", "2.1"];
    TypeScriptVersion.Lowest = "2.0";
    TypeScriptVersion.Latest = "2.1";
    function isPrerelease(version) {
        return version === "2.1";
    }
    TypeScriptVersion.isPrerelease = isPrerelease;
    /** List of NPM tags that should be changed to point to the latest version. */
    function tagsToUpdate(typeScriptVersion) {
        switch (typeScriptVersion) {
            case "2.0":
                // A 2.0-compatible package is assumed compatible with TypeScript 2.1
                // We want the "2.1" tag to always exist.
                return [tags.latest, tags.v2_0, tags.v2_1];
            case "2.1":
                // Eventually this will change to include "latest", too.
                // And obviously we shouldn't advance the "2.0" tag if the package is now 2.1-specific.
                return [tags.v2_1];
        }
    }
    TypeScriptVersion.tagsToUpdate = tagsToUpdate;
    var tags;
    (function (tags) {
        tags.latest = "latest";
        tags.v2_0 = "ts2.0";
        tags.v2_1 = "ts2.1";
    })(tags || (tags = {}));
})(TypeScriptVersion = exports.TypeScriptVersion || (exports.TypeScriptVersion = {}));
//# sourceMappingURL=packages.js.map