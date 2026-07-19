import { Router } from 'express';
import { login, logout, refresh, register } from '../controllers/authController.js';
import { seedUsers } from '../utils/seed.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/seed', async (req, res, next) => {
  try {
    const user = await seedUsers();
    res.json({ message: 'Test user created', user });
  } catch (error) {
    next(error);
  }
});

export default router;
