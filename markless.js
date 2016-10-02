if(Object.values === undefined){
    Object.values = function(obj){
        var vals = [];
        for(var key in obj){
            vals.push(obj[key]);
        }
        return vals;
    };
}

var MarklessParser = function(){
    var self = this;
    var dom = window.document;
    
    var c = 0;
    var labels = {};
    var source = "";
    var stringBuffer = "";
    var lineDirectives = {};
    var inlineDirectives = {};
    var document = dom.createElement("article");
    var lineMode = "unescaped";
    var locallyDisabledDirectives = [];

    self.globallyDisabledDirectives = [];

    // Extension
    self._prepareDirective = function(prototype){
        if(typeof prototype !== "function") throw "Directive prototype must be a function.";

        var directive = new prototype();
        if(typeof directive.name !== "string") throw "Directive name must be a string.";
        if(typeof directive.maybeParse !== "function") throw "Directive maybeParse must be a function.";
        
        if(!directive.isDisabled){
            directive.isDisabled = function(){
                return self.globallyDisabledDirectives.find(function(e){return e === name;})
                    || locallyDisabledDirectives.find(function(a){return a.find(function(e){return e === name;});});
            };
        }
        
        return directive;
    }
    
    self.addLineDirective = function(prototype){
        var directive = self._prepareDirective(prototype);
        lineDirectives[directive.name] = directive;
        return directive;
    }

    self.addInlineDirective = function(prototype){
        var directive = self._prepareDirective(prototype);
        inlineDirectives[directive.name] = directive;
        return directive;
    }

    self.listLineDirectives = function(){
        return Object.values(lineDirectives);
    }

    self.listInlineDirectives = function(){
        return Object.values(inlineDirectives);
    }

    self.pushDisabledDirectives = function(directives){
        if(typeof directives !== "array") throw "List of directives to disable must be an array.";
        
        locallyDisabledDirectives.push(directives);
        return locallyDisabledDirectives;
    }

    self.popDisabledDirectives = function(){
        locallyDisabledDirectives.pop();
        return locallyDisabledDirectives;
    }

    // Document mangling
    self.insertString = function(string){
        if(typeof string !== "string") throw "Attempted to insert non-string as string:"+string;
        
        stringBuffer = stringBuffer + string;
        return document;
    }

    self.insertNewline = function(){
        self.insertComponent("br");
        return document;
    }

    self.insertComponent = function(type){
        var comp = self.startComponent(type);
        self.endComponent(comp);
        return comp;
    }

    self.startComponent = function(type){
        var component = dom.createElement(type);
        self.flushString();
        document.appendChild(component);
        document = component;
        return document;
    }

    self.flushString = function(){
        if(stringBuffer !== ""){
            document.appendChild(dom.createTextNode(stringBuffer));
        }
        stringBuffer = "";
        return document;
    }

    self.endComponent = function(comp){
        self.flushString();
        if(document === comp){
            document = document.parentNode;
        }else if(document.parentNode){
            document = document.parentNode;
            self.endComponent(comp);
        }else{
            throw "Attempted to end component "+comp.tagName+" while it is not open."
        }
        return document;
    }

    // Lexer
    self.c = function(newPos){
        if(newPos !== undefined){
            c = newPos;
        }
        if(c<0) c = 0;
        else if(source.length<c) c = source.length;
        return c;
    }

    self.at = function(pos){
        pos = (pos === undefined)? c : pos;
        if(pos<0) return '';
        else if(source.length<=pos) return '\n';
        else return source[pos] ;
    }
    
    self.here = function(){
        return self.at(c);
    }

    self.next = function(){
        return self.at(c+1);
    }

    self.prev = function(){
        return self.at(c-1);
    }

    self.advance = function(n){
        if(n === undefined) n = 1;
        return (c<source.length)? c+=n : c;
    }

    self.backtrack = function(){
        return (0<c)? c-- : c;
    }

    self.consume = function(){
        var cur = self.here();
        self.advance();
        return cur;
    }

    self.length = function(){
        return source.length;
    }

    self.hasMore = function(p){
        return (p !== undefined)? p<source.length-1: c<source.length-1;
    }
    
    // Parsing
    self.reset = function(){
        c = 0;
        labels = {};
        lineMode = "unescaped";
        document = dom.createElement("article");
        return document;
    }
    
    self.parseInto = function(target, input){
        if(typeof target !== "object") throw "Target to parse into must be a DOM object.";
        
        target.innerHTML = "";
        self.reset();
        document = target;
        return self.parse(input);
    }

    self.parse = function(input){
        if(typeof input !== "string") throw "Input to parse must be a string.";
        var root = document;
        source = input;
        while(c<source.length){
            self.parseOne();
        }
        self.endComponent(document);
        return document;
    }

    self.parseOne = function(){
        self.maybeParseEscape()
            || self.maybeParseLineDirective()
            || self.maybeParseEndOfLine()
            || self.maybeParseInlineDirective()
            || self.parseCharacter();
        return document;
    }

    self.maybeParseEscape = function(){
        if(self.here() === '\\'){
            c++;
            if(self.here() !== '\n'){
                self.parseCharacter();
                return true;
            }
        }
        return false;
    }

    self.maybeParseLineDirective = function(){
        if(c==0 || source[c-1] === '\n' || document.childNodes.length === 0){
            for(var i in lineDirectives){
                if(!lineDirectives[i].isDisabled()
                   && lineDirectives[i].maybeParse(self)){
                    return true;
                }
            }
        }
        return false;
    }

    self.maybeParseEndOfLine = function(){
        if(self.here() === '\n'){
            switch(lineMode){
            case "always":    self.insertNewline(); break;
            case "unescaped": if(self.prev() !== '\\') self.insertNewline(); break;
            case "escaped":   if(self.prev() === '\\') self.insertNewline(); break;
            case "never":     break;
            }
            c++;
            return true;
        }
        return false;
    }

    self.maybeParseInlineDirective = function(){
        for(var i in inlineDirectives){
            if(!inlineDirectives[i].isDisabled()
               && inlineDirectives[i].maybeParse(self)){
                return true;
            }
        }
        return false;
    }

    self.parseCharacter = function(){
        self.insertString(self.consume());
        return true;
    }

    // Default directives
    self.addLineDirective(MarklessDirective_header);
    self.addLineDirective(MarklessDirective_horizontal_rule);
    self.addLineDirective(MarklessDirective_code_block);
    self.addLineDirective(MarklessDirective_instruction);

    return self;
}

var MarklessDirective_unknown = function(){
    var self = this;
    self.name = "unknown";

    self.maybeParse = function(p){
        return false;
    }
    
    return self;
}

var MarklessDirective_header = function(){
    var self = this;
    self.name = "header";

    self.maybeParse = function(p){
        if(p.here() === '#'
           && (p.next() === '#' || p.next() === ' ')){
            var level = 0;
            while(p.consume() === '#'){
                level++;
            }
            if(level>6) level = 6;
            var comp = p.startComponent("h"+level);
            while(p.here() !== '\n'){
                p.maybeParseEscape()
                    || p.maybeParseInlineDirective()
                    || p.parseCharacter();
            }
            // FIXME: label
            p.advance();
            p.endComponent(comp);
            return true;
        }
        return false;
    }
    
    return self;
}

var MarklessDirective_horizontal_rule = function(){
    var self = this;
    self.name = "horizontal-rule";

    self.maybeParse = function(p){
        if(p.here() === '=' && p.next() === '='){
            p.insertComponent("hr");
            while(p.consume() !== '\n');
            return true;
        }
        return false;
    }
    
    return self;
}

var MarklessDirective_code_block = function(){
    var self = this;
    self.name = "code-block";

    self.maybeParse = function(p){
        if(p.here() === ':' && p.next() === ':'){
            var colons = 0;
            var lang = "unknown";
            var args = "";
            
            while(p.here() === ':'){ colons++; p.advance();}
            // Process Args
            switch(p.here()){
            case '\n': p.advance(); break;
            case ' ': p.advance();
                lang = "";
                while(p.here() !== '\n'){
                    if(p.here() === ' '){
                        p.advance();
                        break;
                    }
                    lang = lang+p.consume();
                }
                while(p.here() !== '\n'){
                    args = args+p.consume();
                }
                p.advance();
                break;
            }
            // Construct body
            var comp = p.startComponent("pre");
            comp.setAttribute("data-lang", lang);
            comp.setAttribute("data-lang-args", args);
            p.startComponent("code");
            while(p.hasMore()){
                var c = p.consume();
                if(c === '\n'){
                    var count = 0;
                    var pos = p.c();
                    while(p.at(pos) === ':'){count++;pos++;}
                    if(count === colons){
                        while(p.consume() !== '\n');
                        break;
                    }
                }
                p.insertString(c);
            }
            p.endComponent(comp);
            return true;
        }
        return false;
    }
    
    return self;
}

var MarklessDirective_instruction = function(){
    var self = this;
    self.name = "instruction";

    self.maybeParse = function(p){
        if(p.here() === '!' && p.next() === ' '){
            var instruction = "";
            var args = "";
            
            p.advance(2);
            while(p.here() !== '\n'){
                instruction = instruction + p.consume();
                if(p.here() === ' '){
                    p.advance();
                    break;
                }
            }
            while(p.here() !== '\n'){args = args+p.consume();}
            args = args.split(" ");

            switch(instruction){
            case "set": break;
            case "warn": console.log.apply(console, args); break;
            case "error": throw args; break;
            case "include": break;
            case "disable-directives":
                for(var i=0; i<args.length; i++){
                    p.globallyDisabledDirectives.push(args[i]);
                }
                console.log(p.globallyDisabledDirectives);
                break;
            case "enable-directives":
                p.globallyDisabledDirectives =
                    p.globallyDisabledDirectives.filter(function(e){
                        return !args.find(function(f){return e===f;})});
                break;
            default: throw "Unknown instruction: "+instruction;
            }
        }
    }
    
    return self;
}
