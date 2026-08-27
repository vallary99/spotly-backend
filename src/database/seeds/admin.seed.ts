// Seeds the first platform admin, following the same shape as the
// super-admin seed in scoo2re-backend-app.
//
// Usage:
//   npm run seed:admin              # .env.local
//   npm run seed:admin:prod         # .env.prod
//
// Who gets seeded comes from ADMIN_EMAIL / ADMIN_NAME in the env file.
//
// Nobody picks the password. The seed generates a random one, writes only
// its bcrypt hash, and emails the plaintext to the account owner, who
// changes it on first login. That keeps the credential out of argv, out
// of shell history, and out of this repo.
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { AppDataSource } from '../config/datasource';
import { loadEnv } from '../../libs/env/load-env';
import { UserRole } from '../../auth/entities/user.entity';

const envFile = loadEnv();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const ADMIN_NAME = process.env.ADMIN_NAME || 'Spotly Admin';

// Same cost factor AuthService.signup uses — a hash written here has to
// verify against bcrypt.compare on the normal /auth/login path.
const BCRYPT_ROUNDS = 10;

function generateTempPassword(): string {
  return crypto.randomBytes(12).toString('base64url');
}

function adminLoginUrl(): string {
  const base = (
    process.env.ADMIN_APP_URL ||
    process.env.FRONTEND_URL ||
    ''
  ).replace(/\/+$/, '');
  return base ? `${base}/login` : '';
}

function loginButton(): string {
  const url = adminLoginUrl();
  if (!url) return '';
  return `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${url}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">Log in to the admin dashboard</a>
        </div>`;
}

function mailer(): { resend: Resend; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return {
    resend: new Resend(apiKey),
    from: process.env.EMAIL_FROM || 'Spotly <onboarding@resend.dev>',
  };
}

async function sendPasswordEmail(email: string, tempPassword: string) {
  const mail = mailer();
  if (!mail) {
    // Mirrors how EmailService degrades without credentials: say what
    // would have been sent rather than failing the seed.
    console.warn(
      'RESEND_API_KEY not set — printing password to console instead',
    );
    console.log(`Temporary password for ${email}: ${tempPassword}`);
    return;
  }

  const { error } = await mail.resend.emails.send({
    from: mail.from,
    to: email,
    subject: 'Spotly — your admin account has been created',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2>Welcome to Spotly</h2>
        <p>An admin account has been created for you.</p>
        <p>Use the temporary password below to log in, then change it immediately.</p>
        <div style="background: #f4f4f4; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
          <code style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">${tempPassword}</code>
        </div>
        ${loginButton()}
        <p><strong>Please change your password after your first login.</strong></p>
      </div>
    `,
  });

  // The Resend SDK reports failures in the response rather than throwing.
  // Falling through quietly here would leave an admin account nobody has
  // the password for, so surface it and print the password instead.
  if (error) {
    console.warn(`Could not email the password: ${error.message}`);
    console.log(`Temporary password for ${email}: ${tempPassword}`);
    return;
  }

  console.log(`Password email sent to ${email}`);
}

async function sendPromotionEmail(email: string) {
  const mail = mailer();
  if (!mail) {
    console.warn('RESEND_API_KEY not set — skipping promotion email');
    return;
  }

  const { error } = await mail.resend.emails.send({
    from: mail.from,
    to: email,
    subject: 'Spotly — you have been promoted to Admin',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2>Spotly Admin</h2>
        <p>Your account has been promoted to <strong>Admin</strong>.</p>
        <p>You can log in with your existing credentials.</p>
        ${loginButton()}
      </div>
    `,
  });

  if (error) {
    // Nothing secret in this one — the account keeps its existing
    // password — so a warning is enough.
    console.warn(`Could not email the promotion notice: ${error.message}`);
    return;
  }

  console.log(`Promotion email sent to ${email}`);
}

async function seed() {
  if (!ADMIN_EMAIL) {
    console.error(`ADMIN_EMAIL is not set in ${envFile}.`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_HOST) {
    console.error(
      `No database configured — expected DATABASE_URL or POSTGRES_* in ${envFile}.`,
    );
    process.exit(1);
  }

  console.log(`Connecting using ${envFile}...`);
  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    const existingAdmins = (await queryRunner.query(
      `SELECT "email" FROM "users" WHERE "role" = $1`,
      [UserRole.ADMIN],
    )) as { email: string }[];

    if (existingAdmins.length > 0) {
      // Matches the reference seed: first admin only. Promoting further
      // accounts afterwards is what scripts/grant-admin.ts is for.
      console.log(
        `An admin already exists (${existingAdmins[0].email}), skipping seed.`,
      );
      await queryRunner.commitTransaction();
      return;
    }

    const existing = (await queryRunner.query(
      `SELECT "id" FROM "users" WHERE "email" = $1`,
      [ADMIN_EMAIL],
    )) as { id: string }[];

    let tempPassword: string | undefined;

    if (existing.length > 0) {
      // Already signed up through the app — promote in place and leave
      // their existing password alone.
      await queryRunner.query(
        `UPDATE "users" SET "role" = $1 WHERE "id" = $2`,
        [UserRole.ADMIN, existing[0].id],
      );
      console.log(`Existing user promoted to admin: ${ADMIN_EMAIL}`);
    } else {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      await queryRunner.query(
        `INSERT INTO "users" ("email", "passwordHash", "name", "authProvider", "role")
         VALUES ($1, $2, $3, 'email', $4)`,
        [ADMIN_EMAIL, passwordHash, ADMIN_NAME, UserRole.ADMIN],
      );
      console.log(`Admin created: ${ADMIN_EMAIL}`);
    }

    await queryRunner.commitTransaction();

    // Sent after the commit so a failing mail provider cannot roll back
    // an admin that already exists.
    if (tempPassword) {
      await sendPasswordEmail(ADMIN_EMAIL, tempPassword);
    } else {
      await sendPromotionEmail(ADMIN_EMAIL);
    }

    console.log(
      'Log out and back in on spotly-admin for this to take effect — the JWT has to be reissued to carry the role.',
    );
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('Failed to seed admin:', error);
    throw error;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

void seed();
