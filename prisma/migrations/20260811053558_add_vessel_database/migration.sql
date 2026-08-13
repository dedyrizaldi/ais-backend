-- CreateTable
CREATE TABLE "receivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessels" (
    "id" BIGSERIAL NOT NULL,
    "mmsi" TEXT NOT NULL,
    "name" TEXT,
    "callsign" TEXT,
    "imo" INTEGER,
    "shipType" INTEGER,
    "destination" TEXT,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessel_positions" (
    "id" BIGSERIAL NOT NULL,
    "vesselId" BIGINT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "sog" DOUBLE PRECISION,
    "cog" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "navStatus" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vessel_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vessels_mmsi_key" ON "vessels"("mmsi");

-- CreateIndex
CREATE INDEX "vessels_name_idx" ON "vessels"("name");

-- CreateIndex
CREATE INDEX "vessels_imo_idx" ON "vessels"("imo");

-- CreateIndex
CREATE INDEX "vessels_shipType_idx" ON "vessels"("shipType");

-- CreateIndex
CREATE INDEX "vessel_positions_vesselId_idx" ON "vessel_positions"("vesselId");

-- CreateIndex
CREATE INDEX "vessel_positions_receiverId_idx" ON "vessel_positions"("receiverId");

-- CreateIndex
CREATE INDEX "vessel_positions_recordedAt_idx" ON "vessel_positions"("recordedAt");

-- CreateIndex
CREATE INDEX "vessel_positions_vesselId_recordedAt_idx" ON "vessel_positions"("vesselId", "recordedAt");

-- AddForeignKey
ALTER TABLE "vessel_positions" ADD CONSTRAINT "vessel_positions_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_positions" ADD CONSTRAINT "vessel_positions_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "receivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
