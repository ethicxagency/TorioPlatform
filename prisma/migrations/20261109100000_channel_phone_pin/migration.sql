-- Encrypted PIN set when a WhatsApp number is registered through Embedded Signup (needed to re-register it).
ALTER TABLE "channels" ADD COLUMN "phonePinCiphertext" TEXT;
