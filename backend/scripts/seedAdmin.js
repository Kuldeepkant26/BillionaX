/**
 * Creates the Main Admin and the PlatformSettings singleton.
 * Idempotent — running it repeatedly is a no-op.
 *
 *   npm run seed
 */
import mongoose from "mongoose";
import { env, validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { ROLES } from "../src/config/constants.js";
import { User } from "../src/models/user.model.js";
import { PlatformSettings } from "../src/models/platformSettings.model.js";

const run = async () => {
  validateEnv();
  await connectDB();

  const existingSettings = await PlatformSettings.findOne({ key: "GLOBAL" });
  if (existingSettings) {
    logger.info("PlatformSettings already present, skipping");
  } else {
    await PlatformSettings.create({ key: "GLOBAL" });
    logger.info("PlatformSettings created");
  }

  const email = env.seed.adminEmail.toLowerCase();
  const existingAdmin = await User.findOne({ email });

  if (existingAdmin) {
    // Backfill the protection flag on installs seeded before it existed.
    if (!existingAdmin.isProtected) {
      existingAdmin.isProtected = true;
      await existingAdmin.save();
      logger.info(`Main admin already exists (${email}), marked protected`);
    } else {
      logger.info(`Main admin already exists (${email}), skipping`);
    }
  } else {
    // passwordHash is hashed by the pre-save hook.
    await User.create({
      role: ROLES.MAIN_ADMIN,
      name: env.seed.adminName,
      email,
      passwordHash: env.seed.adminPassword,
      isProtected: true,
    });
    logger.info(`Main admin created: ${email}`);
    logger.info(`Password: ${env.seed.adminPassword}  (change it after first login)`);
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Seed failed: ${error.message}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
