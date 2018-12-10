const crypto = require('crypto');
const express = require('express');

const EndpointError = require('./EndpointError');
const { OPEN_API_REFERENCE_ID } = require('./constants');

function joinUris(from, to) {

    while (to.startsWith('/')) {
        to = to.substring(1);
    }
    while (from.startsWith('/')) {
        from = from.substring(1);
    }
    while (from.endsWith('/')) {
        from = from.slice(0, -1);
    }

    return `${from}/${to}`;
}

class Router {

    constructor(components = {}) {

        /**
         * @type {express.Router}
         */
        this.instance = express.Router();
        this.tags = [];
        this.uri = '';
        this.securitySchemeName = '';
        this.securityRequirement = [];
        this.middleware = [];
        this.spec = this.constructor.defaultSpec();

        Object.keys(components || {}).forEach(component => {

            if (!this.spec.components[component]) {
                this.spec.components[component] = components[component];
            } else {
                Object.assign(this.spec.components[component], components[component]);
            }
        });
    }

    /**
     *
     * @param {string|function} uri
     * @param {function} [closure(Router)]
     * @param {[]|null} [tags]
     * @returns {Router}
     */
    group(uri, closure, tags = null) {

        if (typeof uri !== 'string' && arguments.length < 3) {
            tags = closure || null;
            closure = uri;
            uri = '/';
        }

        const router = new this.constructor();
        router.spec = this.spec;
        router.tags = this.tags.concat(tags || []);
        router.uri = joinUris(this.uri, uri);
        router.middleware = [].concat(this.middleware);

        closure(router);

        this.instance.use(uri, router.instance);

        return this;
    }

    /**
     *
     * @param {[function]|function} middleware
     */
    use(middleware) {

        if (!Array.isArray(middleware)) {
            middleware = [ middleware ];
        }

        this.middleware = this.middleware.concat(middleware);
    }

    /**
     *
     * @param {function} middleware
     * @param {string} securitySchemeName
     * @param {{}} securityScheme
     * @param {[]} [securityRequirement]
     */
    secure(middleware, securitySchemeName, securityScheme, securityRequirement = []) {

        Object.assign(this.spec.components.securitySchemes, { [securitySchemeName]: securityScheme });
        Object.assign(this, { securitySchemeName, securityRequirement });

        this.use(middleware);
    }

    /**
     *
     * @param {string} uri
     * @param {Endpoint} Endpoint
     * @param {string|[]} [methods]
     */
    route(uri, Endpoint, methods = 'get') {

        if (!Array.isArray(methods)) {
            methods = [ methods ];
        }

        const endpoint = new Endpoint();
        const responseCodeSchemas = endpoint.responseCodeSchemas() || {};
        const responseHeaders = endpoint.options.responseHeaders;
        const bodySchema = this.unfold(endpoint.bodySchema());
        const operation = endpoint.operation() || {};

        operation.tags = Array.from(new Set(this.tags.concat(operation.tags || [])));

        operation.parameters = []
            .concat(this.getParameters('query', endpoint.querySchema()))
            .concat(this.getParameters('path', endpoint.paramsSchema()))
            .concat(this.getParameters('header', endpoint.headersSchema()))
            .concat(this.getParameters('cookie', endpoint.cookiesSchema()))
            .concat(this.getParameters('cookie', endpoint.signedCookiesSchema()))
            .concat(operation.parameters || []);

        if (operation.parameters.length === 0) {
            delete operation.parameters;
        }

        operation.responses = Object.keys(responseCodeSchemas)
            .reduce((responses, code) => {

                const schema = this.unfold(responseCodeSchemas[code]);
                const description = schema.description || 'Response';
                const contentMediaType = schema.contentMediaType || endpoint.options.defaultResponseMediaType;

                if (schema.contentMediaType) {
                    delete schema.contentMediaType;
                }

                const response = {
                    description,
                    content: {
                        [contentMediaType]: { schema }
                    }
                };

                if (responseHeaders[`${code}`]) {
                    response.headers = responseHeaders[`${code}`];
                }

                return Object.assign(responses, { [`${code}`]: response });

            }, operation.responses || {});

        if (Object.keys(operation.responses).length === 0) {

            operation.responses = {
                [endpoint.options.defaultResponseCode]: {
                    description: 'No schema given for response.'
                }
            };
        }

        if (bodySchema) {

            const contentMediaType = bodySchema.contentMediaType || endpoint.options.defaultRequestBodyMediaType;

            if (bodySchema.contentMediaType) {
                delete bodySchema.contentMediaType;
            }

            operation.requestBody = {
                content: {
                    [contentMediaType]: { schema: bodySchema }
                },
                description: bodySchema.description,
                required: endpoint.options.requestBodyRequiredIfHasSchema
            };
        }

        if (this.securitySchemeName && !operation.security) {

            operation.security = [
                {
                    [this.securitySchemeName]: this.securityRequirement
                }
            ];
        }

        const path = '/' + joinUris(this.uri, uri)
            .split('/')
            .map(p => {

                if (!p.startsWith(':')) {
                    return p || '';
                }
                let paramName = '';
                let regex = null;

                for (let x = 1; x < p.length; x++) {

                    const c = p.charAt(x);

                    if (c === '(') {
                        regex = '';
                        continue;
                    }
                    if (regex !== null) {

                        if (c === ')') {
                            break;
                        }

                        regex+= c;

                    } else {
                        paramName+= c;
                    }
                }

                const exists = operation.parameters.find(p => p.name === paramName);
                const parameter = {
                    name: paramName,
                    in: 'path',
                    required: true
                };

                if (regex) {
                    parameter.schema = {
                        type: 'string',
                        pattern: regex
                    }
                }

                if (!exists) {
                    operation.parameters.push(parameter);
                } else {
                    Object.assign(exists, parameter);
                }
                return `{${paramName}}`;

            })
            .filter(p => !!p)
            .join('/');


        const middleware = endpoint.createMiddleware(this.spec);
        const handler = (req, res, next) => {

            const stack = this.middleware.concat([middleware]);
            let index = 0;

            const advance = err => {

                if (err || index === stack.length) {
                    return next(err);
                }
                stack[index++](req, res, advance);
            };

            advance();
        };

        methods.map(m => m.toLowerCase()).forEach(method => {

            this.instance[method](uri, handler);

            if (!this.spec.paths[path]) {
                this.spec.paths[path] = {};
            }

            this.spec.paths[path][method] = operation;
        });
    }

    /**
     *
     * @param {string|object} info
     * @returns {{openapi, info, paths, components}|*}
     */
    getSpec(info = {}) {

        if (typeof info === 'string') {

            const { name: title, version, author, license } = require(info);
            info = { title, version };

            if (author) {
                info.contact = {};
                switch (typeof  author) {
                    case 'string':
                        const [ name, email, url ] = author.split(' ');

                        if (name) {
                            info.contact.name = name;
                        }
                        if (email) {
                            info.contact.email = email.replace('<', '').replace('>', '');
                        }
                        if (url) {
                            info.contact.url = url.replace('(', '').replace(')', '');
                        }
                        break;

                    case 'object':
                        info.contact = author;
                        break;
                }
            }

            if (license) {
                info.license = {
                    name: license
                };
            }
        }

        Object.assign(this.spec.info, info);

        return this.spec;
    }

    /**
     *
     * @param {string} uri
     * @param {string|object} info
     */
    serveSpec(uri = '/', info = {}) {

        const spec = this.getSpec(info);
        const hash = crypto.createHash('md5').update(JSON.stringify(spec)).digest('hex');
        const lastModified = (new Date()).toUTCString();

        this.instance.get(uri, function specHandler(req, res) {

            res.set({
                'ETag': hash,
                'Last-Modified': lastModified,
                'Cache-Control': 'public, max-age=31536000, must-revalidate'
            });

            res.send(spec);
        });
    }

    /**
     *
     * @param {[function]|function|null} [errorHandlers]
     * @returns {Function}
     */
    mount(errorHandlers = null) {

        const app = express();

        app.use(this.instance);

        if (errorHandlers) {

            app.use(errorHandlers);
        }
        app.use((err, req, res, next) => {

            if (!(err instanceof EndpointError)) {
                err = new EndpointError();
            }

            if (res.headersSent) {
                return next(err);
            }

            res.status(err.code).send(err);
        });

        return app;
    }

    unfold(obj, references = this.spec) {

        if (!obj) {
            return null;
        }
        if (!obj.$ref) {
            return obj;
        }

        let prefix = '#/';

        if (obj.$ref.startsWith(`${OPEN_API_REFERENCE_ID}#/`)) {
            prefix = `${OPEN_API_REFERENCE_ID}#/`;
        }

        return obj.$ref.replace(prefix, '').split('/').reduce((references, key) => {

            return this.unfold(references[key]);

        }, references);
    }

    getParameters(location, schema) {

        const _schema = this.unfold(schema || {});

        return Object.keys(_schema.properties || {})
            .map(paramName => ({
                name: paramName,
                in: location,
                required: Array.isArray(_schema.required) && _schema.required.includes(paramName),
                description: _schema.properties[paramName].description,
                schema: _schema
            }));
    }

    static defaultSpec() {

        return {
            openapi: '3.0.0',
            info: {
                title: 'Express Primer App',
                version: '1.0.0'
            },
            paths: {},
            components: {
                schemas: {
                    EndpointError: {
                        type: 'object',
                        properties: {
                            code: {
                                type: 'integer'
                            },
                            message: {
                                type: 'string'
                            },
                            details: {}
                        },
                        required: ['code', 'message', 'details']
                    },
                    ValidationError: {
                        type: 'object',
                        properties: {
                            code: {
                                type: 'integer'
                            },
                            message: {
                                type: 'string'
                            },
                            details: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        dataPath: {
                                            type: 'string'
                                        },
                                        keyword: {
                                            type: 'string'
                                        },
                                        message: {
                                            type: 'string'
                                        },
                                        params: {
                                            type: 'object'
                                        },
                                        schemaPath: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        },
                        required: ['code', 'message', 'details']
                    },
                },
                responses: {
                    EndpointError: {
                        description: 'Endpoint Error',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/EndpointError'
                                }
                            }
                        }
                    },
                    ValidationError: {
                        description: 'Validation Error',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ValidationError'
                                }
                            }
                        }
                    }
                },
                securitySchemes: {}
            }
        };
    }
}

module.exports = Router;