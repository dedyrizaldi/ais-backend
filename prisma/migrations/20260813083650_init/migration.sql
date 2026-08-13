-- CreateTable
CREATE TABLE `receivers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `host` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vessels` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `mmsi` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `callsign` VARCHAR(191) NULL,
    `imo` INTEGER NULL,
    `shipType` INTEGER NULL,
    `destination` VARCHAR(191) NULL,
    `length` DOUBLE NULL,
    `width` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vessels_mmsi_key`(`mmsi`),
    INDEX `vessels_name_idx`(`name`),
    INDEX `vessels_imo_idx`(`imo`),
    INDEX `vessels_shipType_idx`(`shipType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vessel_positions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `vesselId` BIGINT NOT NULL,
    `receiverId` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `sog` DOUBLE NULL,
    `cog` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `navStatus` INTEGER NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vessel_positions_receiverId_idx`(`receiverId`),
    INDEX `vessel_positions_recordedAt_idx`(`recordedAt`),
    INDEX `vessel_positions_vesselId_recordedAt_idx`(`vesselId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vessel_positions` ADD CONSTRAINT `vessel_positions_vesselId_fkey` FOREIGN KEY (`vesselId`) REFERENCES `vessels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vessel_positions` ADD CONSTRAINT `vessel_positions_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `receivers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
