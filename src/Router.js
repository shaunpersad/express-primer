const crypto = require('crypto');
const express = require('express');

class Router {

    constructor(components = {}) {

        this.app = express.Router();
        this.tags = [];
        this.securitySchemeName = '';
        this.securityRequirement = [];
        this.spec = this.constructor.defaultSpec();

        Object.assign(this.spec.components, components || {});
    }

    group(uri, closure, tags = null) {

        const router = new this();
        router.spec = this.spec;
        router.tags = this.tags.concat(tags || []);

        closure(router);

        this.app.use(uri, router.app);

        return this;
    }

    secure(middleware, securitySchemeName, securityScheme, securityRequirement = []) {

        Object.assign(this.spec.securitySchemes, { [securitySchemeName]: securityScheme });
        Object.assign(this, { securitySchemeName, securityRequirement });

        this.app.use(middleware);
    }

    route(uri, Endpoint, methods = 'get') {

        if (!Array.isArray(methods)) {
            methods = [ methods ];
        }

        const endpoint = new Endpoint();
        const middleware = endpoint.createMiddleware(this.spec);
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

        operation.responses = Object.keys(responseCodeSchemas)
            .reduce((responses, code) => {

                const schema = this.unfold(responseCodeSchemas[code]);
                const description = schema.description || 'Response';
                const contentMediaType = schema.contentMediaType || endpoint.options.defaultResponseMediaType;
                const response = {
                    description,
                    content: {
                        [contentMediaType]: { schema }
                    }
                };

                if (responseHeaders[`${code}`] && responseHeaders[`${code}`][contentMediaType]) {
                    response.headers = responseHeaders[`${code}`][contentMediaType];
                }

                return Object.assign(responses, { [`${code}`]: response });

            }, operation.responses || {});

        if (bodySchema) {

            const contentMediaType = bodySchema.contentMediaType || endpoint.options.defaultRequestBodyMediaType;

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

        const path = '/' + uri
            .split('/')
            .map(p => {

                if (!p.startsWith(':')) {
                    return p;
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


        methods.map(m => m.toLowerCase()).forEach(method => {

            this.app[method](uri, middleware);

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

        this.app.get(uri, function openApiSpecHandler(req, res) {

            res.set({
                'ETag': hash,
                'Last-Modified': lastModified,
                'Cache-Control': 'public, max-age=31536000, must-revalidate'
            });

            res.send(spec);
        });
    }

    listen() {

        const app = express();

        return app.listen.apply(app, arguments);
    }

    unfold(obj, references = this.spec) {

        if (!obj) {
            return null;
        }
        if (!obj.$ref) {
            return obj;
        }

        return obj.$ref.replace('#/', '').split('/').reduce((references, key) => {

            return this.unfold(references[key]);

        }, references);
    }

    getParameters(location, schema = {}) {

        const _schema = this.unfold(schema);

        return Object.keys(_schema.properties || {})
            .map(paramName => ({
                name: paramName,
                in: location,
                required: Array.isArray(_schema.required) && _schema.required.includes(paramName),
                description: _schema.properties[paramName].description
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