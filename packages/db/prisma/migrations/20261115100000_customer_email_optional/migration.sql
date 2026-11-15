-- Public booking identifies guests by phone. Email may be omitted.

ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;
