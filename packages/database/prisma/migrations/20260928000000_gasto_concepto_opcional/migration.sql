-- El concepto es descriptivo y puede omitirse al registrar o editar un gasto.
ALTER TABLE "gasto" ALTER COLUMN "concepto" DROP NOT NULL;
