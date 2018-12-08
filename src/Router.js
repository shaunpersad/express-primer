const express = require('express');

function getParameters(location, schema = {}) {

    return Object.keys(schema.properties || {})
        .map(paramName => {

            return {
                name: paramName,
                in: location,
                required: Array.isArray(schema.required) && schema.required.includes(paramName),
                description: schema.properties[paramName].description
            };
        });
}

function getSchema(schema, schemas) {

    if (!schema) {
       return null;
    }
    if (!schema.$ref) {
        return schema;
    }

    schema = schema.$ref.replace('#/components/schemas/', '').split('/').reduce((schemas, key) => {

        return schemas[key];

    }, schemas);

    return getSchema(schema, schemas);
}

class Router {

    constructor(components = {}) {

        const spec = this.constructor.defaultSpec();

        Object.keys(components || {}).forEach(component => {

            Object.assign(spec.components[component], components[component]);
        });

        this.app = express.Router();
        this.spec = spec;
        this.tags = [];
    }

    group(uri, closure, tags = null) {

        const router = new this();
        router.spec = this.spec;
        router.tags = this.tags.concat(tags || []);

        closure(router);

        this.app.use(uri, router.app);

        return this;
    }

    route(uri, Endpoint, methods) {

        if (!methods) {
            methods = 'get';
        }
        if (!Array.isArray(methods)) {
            methods = [ methods ];
        }

        const endpoint = new Endpoint();
        const middleware = endpoint.createMiddleware(this.spec.components.schemas);
        const responseCodeSchemas = endpoint.responseCodeSchemas() || {};
        const responseHeaders = endpoint.options.responseHeaders;
        const bodySchema = getSchema(endpoint.bodySchema());

        const operation = endpoint.operation() || {};

        operation.tags = Array.from(new Set(this.tags.concat(operation.tags || [])));

        operation.parameters = []
            .concat(getParameters('query', getSchema(endpoint.querySchema())))
            .concat(getParameters('path', getSchema(endpoint.paramsSchema())))
            .concat(getParameters('header', getSchema(endpoint.headersSchema())))
            .concat(getParameters('cookie', getSchema(endpoint.cookiesSchema())))
            .concat(getParameters('cookie', getSchema(endpoint.signedCookiesSchema())));

        operation.responses = Object.keys(responseCodeSchemas)
            .map(code => {

                const schema = getSchema(responseCodeSchemas[code]);
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

                return response;

            })
            .concat(operation.responses || []);

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
                return paramName;

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
     * @param {string} uri
     * @param {string|object} [info]
     * @param {function} [closure]
     */
    serveSpec(uri = '/', info = {}, closure) {

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

        const spec = closure ? closure(this.spec) : this.spec;
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
                }
            }
        };
    }
}

module.exports = Router;