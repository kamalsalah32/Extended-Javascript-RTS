const path = require('path');
const fs = require('fs');


module.exports = {
    config: {
        codeBase: undefined
    },

    setter: function(newConfig) {
        this.config = Object.assign({}, this.config, newConfig);
        if(this.config.codeBase) {
            this.config.codeBase = path.resolve(this.config.codeBase)
        }
    },

    getASTdir: function(dir = this.config.codeBase) {
        dir = path.resolve(dir)
        if(this.config.codeBase && !this.config.ASTdir) {
            this.config.ASTdir = this.config.codeBase+'-AST'
        }

        if(dir === this.config.codeBase) {
            return this.config.ASTdir;
        } else {
            return dir.replace(this.config.codeBase, this.config.ASTdir);
        }
    },

    /**
     * given path to a codebase file, return path to AST
     * @param {String} filePath: full path to js file,
     */
    getASTpath: function(filePath) {
        if(filePath.startsWith(this.config.codeBase)){
            filePath = filePath.replace(this.config.codeBase, this.config.ASTdir);
        } else {
            filePath = path.join(this.config.ASTdir, filePath);
        }
        return filePath+'.json'

    },

    getInjectedDir: function() {
        if(!this.config.injectedDir) {
            this.config.injectedDir = this.config.codeBase + '-injected'
        }
        return this.config.injectedDir;
    },

    /**
     * given path to AST file, return path to original code base file
     * @param {String} ASTPath path to AST file
     */
    getCodebasePath: function(ASTPath) {
        let ASTdir = this.getASTdir();
        if(ASTPath.startsWith(ASTdir)) {
            ASTPath = ASTPath.replace(ASTdir, this.config.codeBase);
        } else {
            ASTPath = path.join(this.config.codeBase, ASTPath)
        }

        if(ASTPath.endsWith('.js.json') || ASTPath.endsWith('.jsx.json')) {
            ASTPath = ASTPath.substring(0, ASTPath.length-5);
        }

        return ASTPath;
    },


    getCodeBasePackageJson: function() {
        if(!this.config.packageJson) {
            if(fs.existsSync(path.join(this.config.codeBase, 'package.json'))) {
                this.config.packageJson = JSON.parse(fs.readFileSync(path.join(this.config.codeBase, 'package.json')))
            }
        }

        return this.config.packageJson;
    }

}