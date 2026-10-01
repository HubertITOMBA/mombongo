-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemKind" "LineItemKind" NOT NULL,
    "reference" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unité',
    "unitPriceCents" INTEGER NOT NULL,
    "vatBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: several NULL references stay allowed in PostgreSQL
CREATE UNIQUE INDEX "CatalogItem_organizationId_reference_key" ON "CatalogItem"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "CatalogItem_organizationId_active_idx" ON "CatalogItem"("organizationId", "active");

-- CreateIndex
CREATE INDEX "CatalogItem_organizationId_itemKind_idx" ON "CatalogItem"("organizationId", "itemKind");

-- CreateIndex
CREATE INDEX "CatalogItem_organizationId_name_idx" ON "CatalogItem"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
