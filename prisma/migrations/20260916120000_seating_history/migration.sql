-- CreateTable
CREATE TABLE `SeatingHistory` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `operatorId` VARCHAR(191) NULL,
    `operatorName` VARCHAR(50) NULL,
    `triggerType` VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    `description` VARCHAR(200) NULL,
    `rows` INTEGER NOT NULL,
    `columns` INTEGER NOT NULL,
    `studentCount` INTEGER NOT NULL DEFAULT 0,
    `assignments` JSON NOT NULL,
    `environment` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SeatingHistory_classId_createdAt_idx`(`classId`, `createdAt`),
    INDEX `SeatingHistory_operatorId_idx`(`operatorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SeatingHistory` ADD CONSTRAINT `SeatingHistory_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Classroom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeatingHistory` ADD CONSTRAINT `SeatingHistory_operatorId_fkey` FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
