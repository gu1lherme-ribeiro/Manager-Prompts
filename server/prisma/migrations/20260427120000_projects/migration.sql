-- CreateTable
CREATE TABLE `Project` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `name`      VARCHAR(80)  NOT NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Project_userId_name_key`(`userId`, `name`),
    INDEX `Project_userId_updatedAt_idx`(`userId`, `updatedAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Prompt` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Prompt_userId_projectId_updatedAt_idx` ON `Prompt`(`userId`, `projectId`, `updatedAt` DESC);

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prompt` ADD CONSTRAINT `Prompt_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
