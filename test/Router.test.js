const httpMocks = require('node-mocks-http');
const request = require('supertest');
const { expect } = require('chai');
const { EventEmitter } = require('events');
const { constants, Endpoint, Router, EndpointError, Response, ValidationError } = require('../index');
const { OPEN_API_REFERENCE_ID } = constants;

describe('Router', function() {

    describe('usage', function () {

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
                app.use(Endpoint.errorHandler);

                console.log(JSON.stringify(router.getSpec()));


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
    });
});