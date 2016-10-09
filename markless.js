// Compat.
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
    var start = 0;
    var end = 0;
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
        if(typeof directive.init !== "function") throw "Directive init must be a function.";
        
        directive.isDisabled = function(){
            return self.globallyDisabledDirectives === true
                || self.globallyDisabledDirectives.find(function(e){return e === directive.name;})
                || locallyDisabledDirectives.find(function(a){return a === true || a.find(function(e){return e === directive.name;});});
        };
        
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
        if(c<start) c = start;
        else if(end<c) c = end;
        return c;
    }

    self.at = function(pos){
        pos = (pos === undefined)? c : pos;
        if(pos<start) return '';
        else if(end<=pos) return '\n';
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
        return (c<end)? c+=n : c;
    }

    self.backtrack = function(){
        return (start<c)? c-- : c;
    }

    self.consume = function(){
        var cur = self.here();
        self.advance();
        return cur;
    }

    self.length = function(){
        return end;
    }

    self.hasMore = function(p){
        return (p !== undefined)? p<end-1: c<end-1;
    }

    self.matches = function(string){
        var p = c;
        var i = 0;
        while(p.here() === string[i]){
            p++; i++;
        }
        return i == string.length;
    }
    
    // Parsing
    self.reset = function(){
        c = start;
        labels = {};
        lineMode = "unescaped";
        document = dom.createElement("article");
        for(var i in lineDirectives){lineDirectives[i].init();}
        for(var i in inlineDirectives){inlineDirectives[i].init();}
        return document;
    }
    
    self.parseInto = function(target, input, s, e){
        if(typeof target !== "object") throw "Target to parse into must be a DOM object.";
        
        target.innerHTML = "";
        self.reset();
        document = target;
        return self.parse(input, s, e);
    }

    self.parse = function(input, s, e){
        if(typeof input !== "string") throw "Input to parse must be a string.";
        
        var root = document;
        source = input;
        start = (s === undefined)? 0 : s;
        end   = (e === undefined)? input.length : e;
        while(c < end){
            self.parseOne();
        }
        self.endComponent(root);
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
            self.maybeParseEndOfLine()
                || self.parseCharacter();
            return true;
        }
        return false;
    }

    self.maybeParseLineDirective = function(){
        if((c==0 || source[c-1] === '\n' || document.childNodes.length === 0)
           && stringBuffer.length === 0){
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
    for(var name in MarklessStandardDirectives){
        var directive = MarklessStandardDirectives[name];
        switch(directive.prototype.type){
        case "line": self.addLineDirective(directive); break;
        case "inline": self.addInlineDirective(directive); break;
        default: throw ["Directive "+name+" has invalid type "+directive.prototype.type,directive]; break;
        }
    }
    
    return self;
}

var MarklessStandardDirectives = {};

var defineMarklessDirective = function(name, type, init){
    MarklessStandardDirectives[name] = function(){
        var self = this;
        init(self);
        return self;
    };
    MarklessStandardDirectives[name].prototype.type = type;
    MarklessStandardDirectives[name].prototype.name = name;
}

var defineSimpleMarklessDirective = function(name, type, maybeParse){
    defineMarklessDirective(name, type, function(self){
        self.maybeParse = maybeParse;
        self.init = function(){}
    });
}
    
defineSimpleMarklessDirective("header", "line", function(p){
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
});

defineSimpleMarklessDirective("horizontal-rule", "line", function(p){
    if(p.here() === '=' && p.next() === '='){
        p.insertComponent("hr");
        while(p.consume() !== '\n');
        return true;
    }
    return false;
});

defineSimpleMarklessDirective("code-block", "line", function(p){
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
});

defineSimpleMarklessDirective("instruction", "line", function(p){
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
        p.advance();
        args = args.split(" ");

        switch(instruction){
        case "set":
            switch(args[0]){
            case "linemode": lineMode = args[1]; break;
            default: console.log("Unknown variable",args[0],"cannot set to",args[1]); break;
            } break;
        case "warn": console.log.apply(console, args); break;
        case "error": throw args; break;
        case "include": console.log("Cannot include documents. Instruction ignored."); break;
        case "disable-directives":
            for(var i=0; i<args.length; i++){
                if(!p.globallyDisabledDirectives.find(function(e){return e==args[i]}))
                    p.globallyDisabledDirectives.push(args[i]);
            }
            break;
        case "enable-directives":
            p.globallyDisabledDirectives =
                p.globallyDisabledDirectives.filter(function(e){
                    return !args.find(function(f){return e===f;})});
            break;
        default: throw "Unknown instruction: "+instruction;
        }
        return true;
    }
    return false;
});

defineMarklessDirective("blockquote", "line", function(self){
    var component = undefined;
    var source = undefined;
    
    self.init = function(){
        component = undefined;
        source = undefined;
    }
    
    self.maybeParse = function(p){
        if(p.here() === '~' && p.next() === ' '){
            p.advance(2);
            source = "";
            while(p.here() !== '\n'){
                source = source + p.consume();
            }
            p.advance();
            return true;
        }else if(p.here() === '|' && p.next() === ' '){
            if(component === undefined){
                component = p.startComponent("blockquote");
            }

            p.advance(2);
            while(p.here() !== '\n'){
                p.maybeParseEscape()
                    || p.maybeParseLineDirective()
                    || p.maybeParseInlineDirective()
                    || p.parseCharacter();
            }
            
            return true;
        }else if(component !== undefined){
            if(source !== undefined){
                p.startComponent("footer");
                p.insertString(" - ");
                p.startComponent("cite");
                p.insertString(source);
            }
            
            p.endComponent(component);
            self.init();
        }
        return false;
    };
});

defineSimpleMarklessDirective("comment", "line", function(p){
    if(p.here() === ';' && (p.next() === ';' || p.next() === ' ')){
        while(p.consume() !== '\n');
        return true;
    }
    return false;
});

var defineSurroundingInlineDirective = function(name, tag, recog, inner){
    if(inner === undefined) inner = [name];
    defineSimpleMarklessDirective(name, "inline", function(p){
        if(p.here() === recog){
            var repeats = 0;
            while(p.here() === recog){repeats++; p.advance();}
            
            var comp = p.startComponent(tag);
            p.pushDisabledDirectives(inner);
            while(p.here() !== '\n'){
                if(p.here() === recog){
                    var count = 0;
                    var pos = p.c();
                    while(p.at(pos) === recog){count++;pos++;}
                    if(count >= repeats){
                        for(var i=0; i<repeats; i++)p.advance();
                        break;
                    }
                }
                
                p.maybeParseEscape()
                    || p.maybeParseInlineDirective()
                    || p.parseCharacter();
            }
            p.popDisabledDirectives();
            p.endComponent(comp);
            return true;
        }
        return false;
    });
}

defineSurroundingInlineDirective("bold", "b", '*');
defineSurroundingInlineDirective("italic", "i", '/');
defineSurroundingInlineDirective("underline", "u", '_');
defineSurroundingInlineDirective("code", "code", '`', true);

defineSimpleMarklessDirective("dash", "inline", function(p){
    if(p.here() === '-' && p.next() === '-'){
        p.insertString("—");
        p.advance(2);
        return true;
    }
    return false;
});

var defineComplexSurroundingInlineDirective = function(name, tag, start, left, right, end, inner){
    if(inner === undefined) inner = [name];
    defineSimpleMarklessDirective(name, "inline", function(p){
        if(p.here() === start && p.next() === left){
            p.advance();
            var repeats = 0;
            while(p.here() === left){repeats++; p.advance();}
            
            var comp = p.startComponent(tag);
            p.pushDisabledDirectives(inner);
            while(p.here() !== '\n'){
                if(p.here() === right){
                    var count = 0;
                    var pos = p.c();
                    while(p.at(pos) === right){count++;pos++;}
                    if(count == repeats && (!end || p.at(pos) === end)){
                        for(var i=0; i<repeats; i++)p.advance();
                        if(end)p.advance();
                        break;
                    }
                }
                
                p.maybeParseEscape()
                    || p.maybeParseInlineDirective()
                    || p.parseCharacter();
            }
            p.popDisabledDirectives();
            p.endComponent(comp);
            return true;
        }
        return false;
    });
}

defineComplexSurroundingInlineDirective("strikethrough", "strike", '<', '-', '-', '>');
defineComplexSurroundingInlineDirective("subtext", "sub", 'v', '(', ')');
defineComplexSurroundingInlineDirective("supertext", "sup", '^', '(', ')');
