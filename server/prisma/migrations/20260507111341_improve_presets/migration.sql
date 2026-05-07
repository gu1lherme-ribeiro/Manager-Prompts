-- AlterTable
ALTER TABLE `User` ADD COLUMN `defaultImprovePresetId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ImprovePreset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `systemPrompt` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ImprovePreset_userId_updatedAt_idx`(`userId`, `updatedAt` DESC),
    UNIQUE INDEX `ImprovePreset_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_defaultImprovePresetId_fkey` FOREIGN KEY (`defaultImprovePresetId`) REFERENCES `ImprovePreset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImprovePreset` ADD CONSTRAINT `ImprovePreset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
