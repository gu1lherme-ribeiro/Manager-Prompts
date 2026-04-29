-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `firstName` VARCHAR(80) NULL AFTER `passwordHash`,
    ADD COLUMN `lastName`  VARCHAR(80) NULL AFTER `firstName`;
