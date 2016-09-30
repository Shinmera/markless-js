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
    self.addLineDirective = function(name, parseFun){
        if(typeof name !== "string") throw "Directive name must be a string.";
        if(typeof parseFun !== "function") throw "Directive parseFun must be a function.";
        
        self.lineDirectives[name] = {
            "name": name,
            "maybeParse": parseFun,
            "isDisabled": function(){
                return globallyDisabledDirectives.find(function(e){return e === name;})
                    || locallyDisabledDirectives.find(function(a){return a.find(function(e){return e === name;});});
            }
        };
        return self.lineDirectives[name];
    }

    self.addInlineDirective = function(name, parseFun){
        if(typeof name !== "string") throw "Directive name must be a string.";
        if(typeof parseFun !== "function") throw "Directive parseFun must be a function.";
        
        self.inlineDirectives[name] = {
            "name": name,
            "maybeParse": parseFun,
            "isDisabled": function(){
                return globallyDisabledDirectives.find(function(e){return e === name;})
                    || locallyDisabledDirectives.find(function(a){return a.find(function(e){return e === name;});});
            }
        };
        return self.inlineDirectives[name];
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
        self.endComponent();
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

    self.endComponent = function(){
        self.flushString();
        if(document.parentNode){
            document = document.parentNode;
        }
        return document;
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
        
        source = input;
        while(c<source.length){
            self.parseOne();
        }
        self.endComponent();
        return document;
    }

    self.parseOne = function(){
        self.maybeParseEscape()
            || self.maybeParseLineDirective()
            || self.maybeParseEndOfLine()
            || self.maybeParseInlineDirective()
            || self.parseCharacter();
    }

    self.maybeParseEscape = function(){
        if(source[c] === '\\'){
            c++;
            if(source[c] !== '\n'){
                if(c<source.length){
                    self.insertString(source[c]);
                    c++;
                }
                return true;
            }
        }
        return false;
    }

    self.maybeParseLineDirective = function(){
        if(c==0 || source[c-1] == '\n' || document.childNodes.length == 0){
            for(var i=0; i<lineDirectives.length; i++){
                if(lineDirectives[i].isDisabled() === false
                   && lineDirectives[i].maybeParse(source)){
                    return true;
                }
            }
        }
        return false;
    }

    self.maybeParseEndOfLine = function(){
        if(source[c] === '\n'){
            switch(lineMode){
            case "always":    self.insertNewline(); break;
            case "unescaped": if(0<c && source[c-1] !== '\\') self.insertNewline(); break;
            case "escaped":   if(0<c && source[c-1] === '\\') self.insertNewline(); break;
            case "never":     break;
            }
            c++;
            return true;
        }
        return false;
    }

    self.maybeParseInlineDirective = function(){
        for(var i=0; i<inlineDirectives.length; i++){
            if(inlineDirectives[i].isDisabled() === false
               && inlineDirectives[i].maybeParse(self)){
                return true;
            }
        }
        return false;
    }

    self.parseCharacter = function(){
        self.insertString(source[c]);
        c++;
        return true;
    }
}
