import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

export const seedUsers = async () => {
  try {
    const testEmail = 'dulguun0926miigaa@gmail.com';
    const testPassword = 'password123';

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existing) {
      console.log('[SEED] Test user already exists');
      return existing;
    }

    // Create test user
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        username: 'dulguun',
        password: hashedPassword,
      },
      select: { id: true, email: true, username: true },
    });

    console.log('[SEED] Test user created:', user);
    return user;
  } catch (error) {
    console.error('[SEED] Error seeding user:', error?.message);
    throw error;
  }
};
