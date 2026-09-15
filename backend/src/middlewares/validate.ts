import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({ ...req.body, ...req.params, ...req.query });
      next();
    } catch (error: any) {
      const issues = error.errors?.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ success: false, message: 'Validatsiya xatosi', data: issues });
    }
  };
}