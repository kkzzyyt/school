-- CreateTable
CREATE TABLE `Teacher` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `title` VARCHAR(80) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(120) NULL,
    `notes` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Teacher_classId_status_sortOrder_idx`(`classId`, `status`, `sortOrder`),
    UNIQUE INDEX `Teacher_classId_name_key`(`classId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimetablePeriod` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `period` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `type` ENUM('CLASS', 'MORNING_STUDY', 'LUNCH_BREAK', 'EVENING_STUDY') NOT NULL DEFAULT 'CLASS',
    `startTime` CHAR(5) NOT NULL,
    `endTime` CHAR(5) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TimetablePeriod_classId_type_idx`(`classId`, `type`),
    UNIQUE INDEX `TimetablePeriod_classId_period_key`(`classId`, `period`),
    UNIQUE INDEX `TimetablePeriod_classId_sortOrder_key`(`classId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `TimetableEntry`
    ADD COLUMN `periodId` VARCHAR(191) NULL,
    ADD COLUMN `teacherId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `TimetableEntry_periodId_idx` ON `TimetableEntry`(`periodId`);

-- CreateIndex
CREATE INDEX `TimetableEntry_teacherId_idx` ON `TimetableEntry`(`teacherId`);

-- CreateIndex
CREATE UNIQUE INDEX `TimetableEntry_classId_weekday_periodId_key` ON `TimetableEntry`(`classId`, `weekday`, `periodId`);

-- AddForeignKey
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Classroom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimetablePeriod` ADD CONSTRAINT `TimetablePeriod_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Classroom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimetableEntry` ADD CONSTRAINT `TimetableEntry_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `TimetablePeriod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimetableEntry` ADD CONSTRAINT `TimetableEntry_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
