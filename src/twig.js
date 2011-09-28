var Twig = {};

var twig = (function(Twig) {
    // Language:
    /*
    OPEN   token_value   CLOSE
    {{ user }}

    Command Logic:
    {%  command  %}

    Comments:
    {# comment... #}
    */

    Twig.trace = false;

    /**
     * Container for methods related to handling high level template tokens
     *      (for example: {{ expression }}, {% logic %}, {# comment #}, raw data)
     */
    Twig.token = {};

    /**
     * Token types.
     */
    Twig.token.type = {
        output: 'output',
        logic: 'logic',
        comment: 'comment',
        raw: 'raw'
    };

    /**
     * Token syntax definitions.
     */
    Twig.token.definitions = {
        /**
         * Output type tokens.
         *  These typically take the form {{ expression }}.
         */
        output: {
            type: Twig.token.type.output,
            open: '{{',
            close: '}}'
        },
        /**
         * Logic type tokens.
         *  These typically take a form like {% if expression %} or {% endif %}
         */
        logic: {
            type: Twig.token.type.logic,
            open: '{%',
            close: '%}'
        },
        /**
         * Comment type tokens.
         *  These take the form {# anything #}
         */
        comment: {
            type: Twig.token.type.comment,
            open: '{#',
            close: '#}'
        }
    };

    Twig.logic = {};

    Twig.logic.type = {
        _if: 'if',
        endif: 'endif',
        _for: 'for',
        endfor: 'endfor',
        _else: 'else',
        elseif: 'elseif',
        set: 'set',

        // Meta-type: Unknown tags, should throw an exception
        unknown: 'unknown'
    }

    /**
     * Regular expressions to match templates to.
     *
     * FORMAT:
     *      type:  The type of expression this matches
     *
     *      regex: A regular expression that matches the format of the token
     *
     *      next:  What logic tokens (if any) pop this token off the logic stack. If empty, the
     *             logic token is assumed to not require an end tag and isn't push onto the stack.
     *
     *      open:  Does this tag open a logic expression or is it standalone. For example,
     *             {% endif %} cannot exist without an opening {% if ... %} tag, so open = false.
     */
    Twig.logic.regex = [
        {
            /**
             * If type logic tokens.
             *
             *  Format: {% if expression %}
             */
            type: Twig.logic.type._if,
            regex: /^if\s+([^\s].+)$/,
            next: [
                Twig.logic.type._else,
                Twig.logic.type.elseif,
                Twig.logic.type.endif
            ],
            open: true
        },
        {
            /**
             * Else if type logic tokens.
             *
             *  Format: {% elseif expression %}
             */
            type: Twig.logic.type.elseif,
            regex: /^elseif\s+([^\s].*)$/,
            next: [
                Twig.logic.type._else,
                Twig.logic.type.endif
            ],
            open: false
        },
        {
            /**
             * Else if type logic tokens.
             *
             *  Format: {% elseif expression %}
             */
            type: Twig.logic.type._else,
            regex: /^else$/,
            next: [
                Twig.logic.type.endif
            ],
            open: false
        },
        {
            /**
             * End if type logic tokens.
             *
             *  Format: {% endif %}
             */
            type: Twig.logic.type.endif,
            regex: /^endif$/,
            next: [ ],
            open: false
        },
        {
            /**
             * Unknown token.
             *
             * Matches of this type should generate an exception.
             */
            type: Twig.logic.type.unknown,
            regex: /.*/
        }
    ];

    Twig.logic.compile = function(raw_token) {
        var expression = raw_token.value.trim();
        var token = Twig.logic.tokenize(expression);

        switch (token.type) {
            case Twig.logic.type._if:
            case Twig.logic.type.elseif:
                var if_expression = token.value[1];
                console.log("T.l.c: Compiling expression ", if_expression);
                // Compile the expression.
                token.expression = Twig.expression.compile({
                    type:  Twig.expression.type.expression,
                    value: if_expression
                });
                delete token.value;

                break;
        }
        console.log("T.l.c: Compiled if data to ", token);
        return token;
    };

    Twig.logic.tokenize = function(expression) {
        var token = {};

        var l = Twig.logic.regex.length;
        for (var i = 0; i < l; i++) {
            var token_template = Twig.logic.regex[i],
                type = token_template.type,
                regex = token_template.regex,
                match_found = false;

            var match = regex.exec(expression.trim());
            if (match != null) {
                match_found = true;
                token.type  = type;
                token.value = match;
                
                if (Twig.trace) console.log("T.l.t: Matched a ", type, " regular expression of ", match[0]);
                if (Twig.trace) console.log(match);
                
                if (type == Twig.logic.type.unknown) throw "Unable to parse '" + match[0] + "' at template:" + exp_offset;

                match_found = true;
            }

            if (match_found) break;
        }

        return token;
    };


    /**
     * What characters start "strings" in token definitions. We need this to ignore token close
     * strings inside an expression.
     */
    Twig.token.strings = ['"', "'"];

    /**
     * Convert a template into high-level tokens.
     */
    Twig.tokenize = function(template) {
        var tokens = [];

        while (template.length > 0) {
            // Find the first occurance of any token type in the template
            var found_token = findToken(template);
            if (Twig.trace) console.log("Found token ", found_token);

            if (found_token.position !== null) {
                // Add a raw type token for anything before the start of the token
                if (found_token.position > 0) {
                    tokens.push({
                        type: Twig.token.type.raw,
                        value: template.substring(0, found_token.position)
                    });
                }
                template = template.substr(found_token.position + found_token.def.open.length);

                var start = 0;
                if (Twig.trace) console.log("Token starts at ", start);

                // Find the end of the token
                var end = findTokenEnd(template, found_token.def, found_token.position);
                if (Twig.trace) console.log("Token ends at ", end);

                var token_str = template.substring(start, end).trim();
                tokens.push({
                    type: found_token.def.type,
                    value: token_str
                });

                template = template.substr(end + found_token.def.close.length);

            } else {
                // No more tokens -> add the rest of the template as a raw-type token
                tokens.push({
                    type: Twig.token.type.raw,
                    value: template
                });
                template = '';
            }
        }

        return tokens;
    }

    function findToken(template) {
        var output = {
            position: null,
            def: null
        };
        if (Twig.trace) console.log(Twig.token.definitions);
        for (tok_name in Twig.token.definitions) {
            var tok = Twig.token.definitions[tok_name];
            var key = tok.open;
            if (Twig.trace) console.log("Searching for ", key);
            var first_key = template.indexOf(key);
            if (Twig.trace) console.log("Found at ", first_key);
            // Does this token occur before any other types?
            if (first_key >= 0 && (output.position == null || first_key < output.position)) {
                output.position = first_key;
                output.def = tok;
            }
        }
        return output;
    }

    function findTokenEnd(template, token_def, start) {
        var end = null;
        var found = false;
        var offset = 0;
        while (!found) {
            if (Twig.trace) console.log("Looking for ", token_def.close);
            if (Twig.trace) console.log("Looking in ", template);
            var pos = template.indexOf(token_def.close, offset);
            if (Twig.trace) console.log("Found end at ", pos);
            if (pos >= 0) {
                end = pos;
                found = true;
            } else {
                // throw an exception
                throw "Unable to find closing bracket '" + token_def.close + "'" + " opened at template position " + start;
            }
            var str_pos = null;
            var str_found = null;
            for (var i=0,l=Twig.token.strings.length;i<l;i++) {
                var str = Twig.token.strings[i];
                var this_str_pos = template.indexOf(str, offset);
                if (this_str_pos > 0 && this_str_pos < pos && ( str_pos == null || this_str_pos < str_pos ) ) {
                    str_pos = this_str_pos;
                    str_found = str;
                }
            }
            // We found a string before the end of the token, now find the string's end and set the search offset to it
            if (str_pos != null) {
                end = null;
                found = false;
                var end_str_pos = template.indexOf(str_found, str_pos);
                offset = end_str_pos + 1;
            }
        }
        return end;
    }

    Twig.expression = { };

    /**
     * The type of tokens used in expressions.
     */
    Twig.expression.type = {
        expression: 'expression',
        operator:   'operator',
        string:     'string',
        filter:     'filter',
        variable:   'variable',
        number:     'number',
        unknown:    'unknown'
    };

    /**
     * The regular expressions used to match tokens in expressions.
     */
    Twig.expression.regex = [
        {
            type: Twig.expression.type.expression,
            // Match (, anything but ), )
            regex: /^\([^\)]+\)/,
            next: [
                Twig.expression.type.operator
            ]
        },
        {
            type: Twig.expression.type.operator,
            // Match any of +, *, /, -,^, ~, !
            regex: /(^[\+\*\/\-\^~!%])/,
            next: [
                Twig.expression.type.expression,
                Twig.expression.type.string,
                Twig.expression.type.variable,
                Twig.expression.type.number,
            ]
        },
        {
            /**
             * Match a string. This is anything between a pair of single or double quotes.
             * NOTE: this doesn't yet handle \' or \"
             */
            type: Twig.expression.type.string,
            // Match ", anything but ", "  OR  ', anything but ', '
            regex: /(^"[^"]*"|'[^']*')/,
            next: [
                Twig.expression.type.operator
            ]
        },
        {
            /**
             * Match a filter of the form something|encode(...)
             */
            type: Twig.expression.type.filter,
            // match a | then a letter or _, then any number of letters, numbers, _ or -
            regex: /(^\|[a-zA-Z_][a-zA-Z0-9_\-]*\([^\)]\))/,
            next: [
                Twig.expression.type.operator
            ]
        },
        {
            /**
             * Match a filter of the form something|raw
             */
            type: Twig.expression.type.filter,
            // match a | then a letter or _, then any number of letters, numbers, _ or -
            regex: /(^\|[a-zA-Z_][a-zA-Z0-9_\-]*)/,
            next: [
                Twig.expression.type.operator
            ]
        },
        {
            /**
             * Match a variable. Variables can contain letters, numbers, underscores and dashes
             * but must start with a letter or underscore.
             */
            type: Twig.expression.type.variable,
            // match any letter or _, then any number of letters, numbers, _ or -
            regex: /(^[a-zA-Z_][a-zA-Z0-9_\-]*)/,
            next: [
                Twig.expression.type.operator,
                Twig.expression.type.filter
            ]
        },
        {
            /**
             * Match a number (integer or decimal)
             */
            type: Twig.expression.type.number,
            // match a number
            regex: /(^\-?\d*\.?\d+)/,
            next: [
                Twig.expression.type.operator,
                Twig.expression.type.filter
            ]
        },
        {
            /*
             * Match anything else.
             * This type will throw an error and halt parsing.
             */
            type: Twig.expression.type.unknown,
            // Catch-all for unknown expressions
            regex:  /^(.*)/,
            next: [ ]
        }
    ];

    /**
     * Parse an RPN expression stack within a context.
     */
    Twig.expression.parse = function(tokens, context) {

        // The output stack
        var stack = [];
        tokens.forEach(function(token) {
            if (Twig.trace) console.log("Parsing ", token);
            switch (token.type) {
                // variable/contant types
                case Twig.expression.type.string:
                case Twig.expression.type.number:
                    stack.push(token.value);
                    break;
                case Twig.expression.type.variable:
                    // Get the variable from the context
                    if (!context.hasOwnProperty(token.value)) {
                        throw "Model doesn't provide the property " + token.value;
                    }
                    stack.push(context[token.value]);
                    break;

                case Twig.expression.type.operator:
                    var operator = token.value;
                    stack = Twig.expression.handleOperator(operator, stack);
                    break;
            }
        });
        if (Twig.trace) console.log("Stack result: ", stack);
        // Pop the final value off the stack
        return stack.pop();
    };

    /**
     * Handle operations on the RPN stack.
     *
     * Returns the updated stack.
     */
    Twig.expression.handleOperator = function(operator, stack) {
        if (Twig.trace) console.log("Handling", operator);
        var a,b,c;
        switch (operator) {
            case '+':
                b = parseFloat(stack.pop());
                a = parseFloat(stack.pop());
                console.log(a, ' + ', b, ' = ', a + b);
                stack.push(a + b);
                break;

            case '-':
                b = parseFloat(stack.pop());
                a = parseFloat(stack.pop());
                console.log(a, ' - ', b, ' = ', a - b);
                stack.push(a - b);
                break;

            case '*':
                stack.push(stack.pop() * stack.pop());
                break;

            case '/':
                b = parseFloat(stack.pop());
                a = parseFloat(stack.pop());
                console.log(a, ' / ', b, ' = ', a / b);
                stack.push(a / b);
                break;

            case '%':
                b = parseFloat(stack.pop());
                a = parseFloat(stack.pop());
                console.log(a, ' % ', b, ' = ', a % b);
                stack.push(a % b);
                break;

            case '~':
                stack.push(stack.pop().toString() + stack.pop().toString());
                break;

            case '!':
                stack.push(!stack.pop());
                break;
        }

        return stack;
    };

    Twig.expression.compile = function(raw_token) {
        var expression = raw_token.value;
        if (Twig.trace) console.log("Compiling expression", expression);

        // Tokenize expression
        var tokens = Twig.expression.tokenize(expression);
        tokens.reverse();
        if (Twig.trace) console.log("tokens are ", tokens);

        // Push tokens into RPN stack using the Sunting-yard algorithm
        // See http://en.wikipedia.org/wiki/Shunting_yard_algorithm

        var output = [];
        var operator_stack = [];

        while(tokens.length > 0) {
            var token = tokens.pop(),
                type = token.type,
                value = token.value;

            switch (type) {
                // variable/contant types
                case Twig.expression.type.string:
                case Twig.expression.type.variable:
                case Twig.expression.type.number:
                    if (Twig.trace) console.log("value: ", value)
                    output.push(token);
                    break;


                case Twig.expression.type.operator:
                    var operator = Twig.expression.parseOperator(value, token);
                    if (Twig.trace) console.log("operator: ", operator);

                    while (operator_stack.length > 0 && (
                                (operator.associativity == Twig.expression.associativity.leftToRight &&
                                 operator.precidence    >= operator_stack[operator_stack.length-1].precidence)

                             || (operator.associativity == Twig.expression.associativity.rightToLeft &&
                                 operator.precidence    >  operator_stack[operator_stack.length-1].precidence))
                           ) {
                         output.push(operator_stack.pop());
                    }

                    operator_stack.push(operator);
                    break;

                /**
                 * Handle sub-expressions (expressions in parenthesis)
                 */
                case Twig.expression.type.expression:
                    var evaluated_expression = Twig.expression.compile(token),
                        sub_stack = evaluated_expression.stack;
                    sub_stack.reverse();
                    while (sub_stack.length > 0) {
                        output.push(sub_stack.pop());
                    }
                    break;

                case Twig.expression.type.filter:
            }
        }

        while(operator_stack.length > 0) {
            output.push(operator_stack.pop());
        }

        if (Twig.trace) console.log("stack is", output);

        raw_token.stack = output;
        delete raw_token.value;

        return raw_token;

    };

    Twig.expression.associativity = {
        leftToRight: 'leftToRight',
        rightToLeft: 'rightToLeft'
    }

    Twig.expression.parseOperator = function(operator, token) {
        switch (operator) {
            // Ternary
            case '?':
            case ':':
                token.precidence = 16;
                token.associativity = Twig.expression.associativity.rightToLeft;
                break;

            case '+':
            case '-':
                token.precidence = 6;
                token.associativity = Twig.expression.associativity.leftToRight;
                break;

            case '*':
            case '/':
            case '%':
                token.precidence = 5;
                token.associativity = Twig.expression.associativity.leftToRight;
                break;

            case '!':
                token.precidence = 3;
                token.associativity = Twig.expression.associativity.rightToLeft;
                break;

            default:
                throw operator + " is an unknown operator."
        }
        token.operator = operator;
        return token;
    }

    Twig.expression.tokenize = function(expression) {
        console.log("T.e.t: Tokenizing expression ", expression);
        var tokens = [],
            exp_offset = 0,
            prev_next = null;
        while (expression.length > 0) {
            var l = Twig.expression.regex.length;
            for (var i = 0; i < l; i++) {
                var token_template = Twig.expression.regex[i],
                    type = token_template.type,
                    regex = token_template.regex,
                    match_found = false;

                expression = expression.trim().replace(regex, function(match, from, offset, string) {
                    if (Twig.trace) console.log("Matched a ", type, " regular expression of ", match);

                    if (type == Twig.expression.type.unknown) throw "Unable to parse '" + match + "' at template:" + exp_offset;
                    // Check that this token is a valid next token
                    var prev_token = tokens.length > 0 ? tokens[tokens.length-1] : null;
                    if (prev_next != null && prev_next.indexOf(type) < 0) {
                        throw type + " cannot follow a " + prev_token.type + " at template:" + exp_offset + " near '" + match.substring(0, 20) + "'";
                    }

                    if (type == Twig.expression.type.expression) {
                        // Trim parenthesis of of an expression
                        match = match.substring(1, match.length-1);
                        console.log("Matched: ", match);
                    }

                    match_found = true;
                    tokens.push({
                        type: type,
                        value: match
                    });
                    prev_next = token_template.next;
                    exp_offset += match.length;
                    return '';
                });
                if (match_found) break;
            }
        }
        return tokens;
    };

    Twig.compile = function(tokens) {
        var output = [];
        var logic_stack = [];

        tokens.reverse();
        while (tokens.length > 0) {
            var token = tokens.pop();
            switch (token.type) {
                case Twig.token.type.raw:
                    output.push(token);
                    break;

                case Twig.token.type.logic:
                    // Compile the logic token
                    var logic_token = Twig.logic.compile(token);
                    console.log("compiled logic token to ", logic_token);
                    logic_token.type = Twig.token.type.logic;
                    output.push({
                        type: Twig.token.type.logic,
                        token: logic_token
                    });
                    break;

                case Twig.token.type.comment:
                    // Do nothing, comments should be ignored
                    break;

                case Twig.token.type.output:
                    output.push(Twig.expression.compile(token));
                    break;
            }
        }
        return output;
    };
    
    /**
     * A Twig Template model.
     *
     * Holds a set of compiled tokens ready to be rendered.
     */
    Twig.Template = function( tokens ) {
        this.tokens = tokens;
        this.render = function(context) {
            console.log("Render context is ", context);
            var output = [];
            tokens.forEach(function(token) {
                switch (token.type) {
                    case Twig.token.type.raw:
                        output.push(token.value);
                        break;

                    case Twig.token.type.logic:
                        break;

                    case Twig.token.type.comment:
                        // Do nothing, comments should be ignored
                        break;

                    case Twig.token.type.output:
                        // Parse the given expression in the given context
                        output.push(Twig.expression.parse(token.stack, context));
                        break;
                }
            });
            return output.join("");
        }
    }

    /**
     * Create and compile a Twig template.
     *
     * Returns a Twig.Template ready for rendering.
     */
    return function(params) {
        if (Twig.debug) console.log("parsing ", params);

        var raw_tokens = Twig.tokenize(params.html);
        console.log("compiling ", raw_tokens);
        var tokens = Twig.compile(raw_tokens);

        if (Twig.debug) console.log("Parzed into ", tokens);

        return new Twig.Template( tokens );
    }
})( Twig );