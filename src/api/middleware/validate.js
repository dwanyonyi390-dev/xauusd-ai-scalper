'use strict';

/**
 * validate(schema)
 *   - schema is a Zod schema  → validates req.body
 * validate({ body?, params?, query? })
 *   - object form            → validates each part present
 * Returns a middleware function (never undefined).
 */
function validate(spec) {
  const isZod = spec && typeof spec.safeParse === 'function';
  const parts = isZod ? { body: spec } : (spec || {});

  return function validator(req, res, next) {
    try {
      for (const key of ['params', 'query', 'body']) {
        const schema = parts[key];
        if (!schema) continue;
        const parsed = schema.safeParse(req[key]);
        if (!parsed.success) {
          return res.status(400).json({
            ok: false,
            error: 'validation_failed',
            where: key,
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          });
        }
        req[key] = parsed.data;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { validate };