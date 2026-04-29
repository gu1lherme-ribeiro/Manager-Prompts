-- AlterTable
ALTER TABLE `Project` ADD COLUMN `sortOrder` INT NOT NULL DEFAULT 0;

-- Backfill: distribui projetos existentes em passos de 10 por usuário, em ordem
-- alfabética. Passo 10 dá folga pra inserir entre dois sem reescrever todo o
-- bloco. Usa ROW_NUMBER() (MySQL 8) — versão anterior com variáveis de sessão
-- batia em P3018/erro 1267 (illegal mix of collations) no shadow database
-- porque a variável `@prev_user` herda a collation default do servidor
-- (utf8mb4_general_ci) e a coluna `userId` é utf8mb4_unicode_ci.
UPDATE `Project` p
JOIN (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY userId ORDER BY name ASC) * 10 AS new_order
    FROM `Project`
) ordered
ON p.id = ordered.id
SET p.sortOrder = ordered.new_order;

-- CreateIndex
CREATE INDEX `Project_userId_sortOrder_idx` ON `Project`(`userId`, `sortOrder`);
