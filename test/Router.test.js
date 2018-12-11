const path = require('path');

const httpMocks = require('node-mocks-http');
const request = require('supertest');
const { expect } = require('chai');
const { Endpoint, Router, EndpointError, ValidationError } = require('../index');

describe('Router', function() {

    describe('API', function () {

        describe(`router.route(uri, Endpoint)`, function() {

            it('routes a uri to an Endpoint', function(done) {

                const router = new Router();
                const body = 'hi';
                router.route('/foo', Endpoint.withHandler(req => body));

                const app = router.mount();

                request(app).get('/foo').expect(200, body, done);

            });
        });

        describe(`router.route(uri, Endpoint, method = 'get')`, function() {

            it('routes to any express-supported HTTP verb', function(done) {

                const router = new Router();
                const body = 'hi';
                router.route('/foo', Endpoint.withHandler(req => body), 'post');

                const app = router.mount();

                request(app).post('/foo').expect(200, body, done);
            });
        });

        describe(`router.route(uri, Endpoint, methods = ['get'])`, function() {

            it('routes to several verbs at once by supplying an array', function(done) {

                const methods = ['get', 'post', 'put'];

                const router = new Router();
                const body = 'hi';
                router.route('/foo', Endpoint.withHandler(req => body), methods);

                const app = router.mount();

                Promise.all(methods.map(method => {

                    return request(app)[method]('/foo').expect(200, body);

                })).then(() => done()).catch(done);

            });
        });

        describe('router.group(uri, closure)', function() {

            it('creates a new group prefixed by the uri', function(done) {

                const router = new Router();
                const body1 = 'hi';
                const body2 = 'hello';

                router.group('/foo', router => {

                    router.group('/bar', router => {

                        router.route('/baz', Endpoint.withHandler(req => body1));

                        router.route('/', Endpoint.withHandler(req => body2), 'post');
                    });
                });

                const app = router.mount();

                Promise.all([

                    request(app).get('/foo/bar/baz').expect(200, body1),
                    request(app).post('/foo/bar').expect(200, body2)

                ]).then(() => done()).catch(done);

            });
        });

        describe('router.group(uri, closure, tags)', function() {

            it('creates a new group prefixed by the uri, where any descendant endpoints will inherit the supplied tags', function(done) {

                const router = new Router();
                const body = 'hi';

                router.group('/foo', router => {

                    router.group('/bar', router => {

                        router.route('/baz', Endpoint.withHandler(req => body));

                    }, ['bar']);

                }, ['foo']);

                const app = router.mount();
                const spec = router.getSpec();

                expect(spec.paths['/foo/bar/baz'].get.tags).to.deep.equal(['foo', 'bar']);

                request(app).get('/foo/bar/baz').expect(200, body, done);

            });
        });

        describe('router.group(closure)', function() {

            it('creates a new group', function(done) {

                const router = new Router();
                const body1 = 'hi';
                const body2 = 'hello';

                router.group(router => {

                    router.use((req, res, next) => {
                        req.query.check = body1;
                        next();
                    });

                    router.group('/foo', router => {

                        router.route('/bar', Endpoint.withHandler(req => req.query.check));

                    });
                });

                router.route('/', Endpoint.withHandler(req => req.query.check));

                const app = router.mount();

                Promise.all([

                    request(app).get('/foo/bar').query({check: body2}).expect(200, body1),
                    request(app).get('/').query({check: body2}).expect(200, body2)

                ]).then(() => done()).catch(done);

            });
        });

        describe('router.group(closure, tags)', function() {

            it('creates a new group, where any descendant endpoints will inherit the supplied tags', function(done) {

                const router = new Router();
                const body1 = 'hi';
                const body2 = 'hello';

                router.group(router => {

                    router.use((req, res, next) => {
                        req.query.check = body1;
                        next();
                    });

                    router.group('/foo', router => {

                        router.route('/bar', Endpoint.withHandler(req => req.query.check));

                    }, ['foo']);

                    router.route('/bat', Endpoint.withHandler(req => req.query.check));


                }, ['check']);

                router.route('/', Endpoint.withHandler(req => req.query.check));

                const spec = router.getSpec();

                expect(spec.paths['/foo/bar'].get.tags).to.deep.equal(['check', 'foo']);
                expect(spec.paths['/bat'].get.tags).to.deep.equal(['check']);
                expect(spec.paths['/'].get.tags).to.deep.equal([]);


                const app = router.mount();

                Promise.all([

                    request(app).get('/foo/bar').query({check: body2}).expect(200, body1),
                    request(app).get('/').query({check: body2}).expect(200, body2)

                ]).then(() => done()).catch(done);

            });
        });

        describe('router.use(middleware)', function() {

            it('applies middleware only to the routes in the group (or descendants)', function(done) {

                const router = new Router();
                const body1 = 'hi';
                const body2 = 'hello';

                router.group('/foo', router => {

                    router.use((req, res, next) => {
                        req.query.check = body1;
                        next();
                    });

                    router.route('/baz', Endpoint.withHandler(req => req.query.check));
                });

                router.route('/', Endpoint.withHandler(req => req.query.check));


                const app = router.mount();

                Promise.all([

                    request(app).get('/foo/baz').expect(200, body1),
                    request(app)
                        .get('/')
                        .query({ check: body2 })
                        .expect(200, body2)

                ]).then(() => done()).catch(done);
            });

            it('also accepts an array of middleware', function(done) {

                const router = new Router();
                const body1 = 'hi';
                const body2 = 'hello';

                router.group('/foo', router => {

                    router.use([(req, res, next) => {
                        req.query.check = body1;
                        next();
                    }]);

                    router.route('/baz', Endpoint.withHandler(req => req.query.check));
                });

                router.route('/', Endpoint.withHandler(req => req.query.check));


                const app = router.mount();

                Promise.all([

                    request(app).get('/foo/baz').expect(200, body1),
                    request(app)
                        .get('/')
                        .query({ check: body2 })
                        .expect(200, body2)

                ]).then(() => done()).catch(done);
            });
        });


        describe('router.secure(middleware, securitySchemeName, securityScheme, securityRequirement = [])', function() {

            it('secures the current group under a middleware + security policy', function(done) {

                const router = new Router();
                const token = 'foo';
                const body = 'hi';
                const unauthorized = new EndpointError('You are not authorized', 401);

                const authMiddleware = (req, res, next) => {

                    req.authorized = req.query.key === token;
                    next();
                };
                const checkAuthMiddleware = (req, res, next) => {

                    const err = req.authorized ? null : unauthorized;
                    next(err);
                };

                router.use(authMiddleware);

                router.group(router => {

                    router.secure(checkAuthMiddleware, 'apiKey', { type: 'apiKey', name: 'key', in: 'query' });

                    router.route('/foo', Endpoint.withHandler(req => body));

                });

                router.route('/', Endpoint.withHandler(req => body));

                const app = router.mount();

                Promise.all([

                    request(app)
                        .get('/foo')
                        .expect(unauthorized.code, unauthorized.toJSON()),
                    request(app)
                        .get('/foo')
                        .query({ key: token })
                        .expect(200, body),
                    request(app)
                        .get('/')
                        .expect(200, body)

                ]).then(() => done()).catch(done);

            });
        });

        describe('router.getSpec(info = {})', function() {

            it('gets an object representation of the OpenAPI spec', function() {

                const router = new Router();
                const body = 'hi';
                router.route('/foo', Endpoint.withHandler(req => body));

                expect(router.getSpec()).to.be.an('object');
            });

            it('merges the optionally supplied object to the info object in the OpenAPI spec', function() {

                const router = new Router();
                const info = { title: 'foo', version: '2.0.0' };
                const spec = router.getSpec(info);

                expect(spec.info.title).to.equal(info.title);
                expect(spec.info.version).to.equal(info.version);
            });
        });

        describe('router.getSpec(packageJsonPath)', function() {

            it('uses your package.json file to fill in the info object in the OpenAPI spec', function() {

                const packageJsonPath = path.resolve(__dirname, '../package.json');
                const packageJson = require(packageJsonPath);

                const router = new Router();
                const spec = router.getSpec(packageJsonPath);

                expect(spec.info.title).to.equal(packageJson.name);
                expect(spec.info.version).to.equal(packageJson.version);

            });
        });

        describe(`router.serveSpec(uri = '/', info = {})`, function() {

            it('serves the spec at the specified URI', function(done) {

                const router = new Router();
                const body = 'hi';
                router.route('/foo', Endpoint.withHandler(req => body));
                router.serveSpec('/bar');

                const spec = router.getSpec();
                expect(spec).to.be.an('object');


                const app = router.mount();

                request(app).get('/bar').expect(200, spec, done);

            });

            it('uses router.getSpec(info) with the optionally supplied info object', function(done) {

                const router = new Router();
                const body = 'hi';
                const info = { title: 'foo', version: '2.0.0' };
                router.route('/foo', Endpoint.withHandler(req => body));
                router.serveSpec('/bar', info);

                const spec = router.getSpec(info);
                expect(spec).to.be.an('object');


                const app = router.mount();

                request(app).get('/bar').expect(200, spec, done);

            });
        });

        describe('router.mount()', function() {

            it('mounts the router onto a new express app and returns it', function(done) {

                const router = new Router();
                const body = 'hi';
                router.route('/foo', Endpoint.withHandler(req => body));

                const app = router.mount();

                request(app).get('/foo').expect(200, body, done);

            });

            describe('the built-in error handler', function() {

                it('creates responses based on EndpointErrors', function(done) {

                    const router = new Router();
                    const message = 'hello';
                    const code = 503;
                    const details = { foo: 'bar' };

                    router.route('/foo', Endpoint.withHandler(req => {

                        throw new EndpointError(message, code, details);
                    }));

                    const app = router.mount();

                    request(app).get('/foo').expect(code, {
                        message,
                        code,
                        details
                    }, done);

                });

                it('converts non-EndpointErrors to EndpointErrors', function(done) {

                    const error = new EndpointError();
                    const router = new Router();

                    router.route('/foo', Endpoint.withHandler(req => {

                        throw new Error('boom!');
                    }));

                    const app = router.mount();

                    request(app).get('/foo').expect(error.code, error.toJSON(), done);

                });

                it('properly handles ValidationErrors', function(done) {

                    const router = new Router();
                    const error = new ValidationError({ foo: 'bar' });

                    router.route('/foo', Endpoint.withHandler(req => {

                        throw error;
                    }));

                    const app = router.mount();

                    request(app).get('/foo').expect(error.code, error.toJSON(), done);

                });
            });
        });

        describe('router.mount(errorHandler)', function() {

            it('mounts the router onto an express app, along with the provided error handler', function(done) {

                const router = new Router();
                const error = new Error('hello');
                const errorHandler = (err, req, res, next) => {

                    res.send(error.message);
                };


                router.route('/foo', Endpoint.withHandler(req => {
                    throw error;
                }));

                const app = router.mount(errorHandler);

                request(app).get('/foo').expect(200, error.message, done);

            });

            it('also accepts an array of error handlers', function(done) {

                const router = new Router();
                const error = new Error('hello');
                const errorHandler = (err, req, res, next) => {

                    res.send(error.message);
                };


                router.route('/foo', Endpoint.withHandler(req => {
                    throw error;
                }));

                const app = router.mount([errorHandler]);

                request(app).get('/foo').expect(200, error.message, done);
            });
        });
    });

    describe('OpenAPI spec generation', function() {

        it('generates an OpenAPI 3.0.0 spec based on routes to Endpoints and optionally supplied spec properties', function(done) {

            const openApiReferences = {
                schemas: {
                    User: {
                        type: 'object',
                        description: 'A registered user of the system',
                        properties: {
                            id: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            age: { type: 'integer', minimum: 16 }
                        },
                        required: ['id', 'firstName', 'lastName', 'age']
                    },
                    UserProfile: {
                        type: 'object',
                        description: 'Additional data about a user.',
                        properties: {
                            likes: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        },
                        required: [ 'likes' ],
                        default: {
                            likes: []
                        }
                    }
                }
            };

            const GetUserEndpoint = class extends Endpoint {

                operation() {
                    return { summary: 'Retrieves a single user by ID.' };
                }

                paramsSchema() {
                    return {
                        properties: {
                            userId: {
                                type: 'string',
                                description: 'The id of the user to retrieve.'
                            }
                        },
                        required: [ 'userId' ]
                    }
                }

                responseCodeSchemas() {

                    return {
                        '200': Endpoint.openApiReference('schemas/User')
                    };
                }

                handler(req) {

                }
            };

            const GetUserProfileEndpoint = class extends Endpoint {

                operation() {
                    return { summary: `Retrieves a user's profile.` };
                }

                paramsSchema() {
                    return {
                        properties: {
                            userId: {
                                type: 'string',
                                description: `The id of the user whose profile to retrieve.`
                            }
                        },
                        required: [ 'userId' ]
                    }
                }

                responseCodeSchemas() {

                    return {
                        '200': Endpoint.openApiReference('schemas/UserProfile')
                    };
                }

                handler(req) {

                }
            };

            const CreateUserEndpoint = class extends Endpoint {

                operation() {
                    return { summary: 'Creates a new user.' };
                }

                bodySchema() {

                    return {
                        type: 'object',
                        description: 'The user details',
                        contentMediaType: 'application/x-www-form-urlencoded',
                        properties: {
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            age: {
                                type: 'integer',
                                minimum: 16
                            },
                            profile: Endpoint.openApiReference('schemas/UserProfile')
                        },
                        required: [ 'firstName' ]
                    };
                }

                responseCodeSchemas() {

                    return {
                        '200': Endpoint.openApiReference('schemas/User')
                    };
                }

                handler(req) {

                }
            };

            const ListUsersEndpoint = class extends Endpoint {

                operation() {
                    return { summary: 'Lists all current users.' };
                }

                querySchema() {
                    return {
                        properties: {
                            page: {
                                type: 'integer',
                                minimum: 1,
                                maximum: 100,
                                default: 1
                            },
                            perPage: {
                                type: 'integer',
                                enum: [ 10, 20, 50, 100 ],
                                default: 20
                            }
                        }
                    };
                }

                responseCodeSchemas() {

                    return {
                        '200': {
                            type: 'array',
                            items: Endpoint.openApiReference('schemas/User')
                        }
                    };
                }

                handler(req) {

                }
            };

            const authMiddleware = (req, res, next) => {

                req.authorized = req.query.key === 'foo'; // the secret key
                next();
            };

            const checkAuthMiddleware = (req, res, next) => {

                const err = req.authorized ? null : new EndpointError('Not authorized.', 401);
                next(err);
            };

            const router = new Router(openApiReferences);

            router.group('/v1', router => {

                router.use(authMiddleware);

                router.group('/users', router => {

                    router.group(router => {

                        router.secure(checkAuthMiddleware, 'Secret Key', { type: 'apiKey', name: 'key', in: 'query' });

                        router.route('/:userId/profile', GetUserProfileEndpoint);

                        router.route('/', CreateUserEndpoint, 'post');

                    }, [ 'Authenticated' ]);

                    router.route('/:userId', GetUserEndpoint);

                    router.route('/', ListUsersEndpoint);
                });
            });

            const packageJsonPath = path.resolve(__dirname, '../package.json');
            router.serveSpec('/', packageJsonPath);

            const app = router.mount();

            request(app)
                .get('/')
                .expect(200)
                .then(res => {

                    expect(res.body).to.be.an('object');
                    done();
                })
                .catch(done);
        });
    });

});