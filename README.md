# ScoreRace Platform — baseline funcional v1

Plataforma full-stack executável com Node.js/Express + PostgreSQL e frontend responsivo, criada a partir do Documento Mestre ScoreRace v1.1.

## O que já funciona

- Portal público responsivo com organizações, campeonatos e ranking publicado.
- Login real com cookie HTTP-only e perfis Organizador / Super Admin.
- Isolamento multi-organização no backend por membership.
- Dashboard do organizador e criação persistente de campeonato.
- Mega Blaster com métricas globais.
- PostgreSQL com entidades centrais: organizações, usuários, piloto global, campeonatos, temporadas, categorias, regras versionadas, etapas, inscrições, resultados, concessões/créditos e auditoria.
- Semântica de etapa DRAFT -> CLOSED -> PUBLISHED / REPUBLISHED e consumo de crédito no encerramento.
- Tema claro/escuro, visual esportivo premium e responsividade.
- Docker Compose para aplicação + PostgreSQL.

## Executar

```bash
docker compose up --build
```

Abra `http://localhost:3000`.

Contas de demonstração:
- Organizador: `organizador@dkr.com.br` / `ScoreRace2026!`
- Mega Blaster: `admin@scorerace.com.br` / `ScoreRace2026!`

## Produção / nuvem

Use o mesmo container `Dockerfile` em ECS/Fargate, Cloud Run, Azure Container Apps, Render, Railway ou Fly.io, conectado a um PostgreSQL gerenciado. Configure `DATABASE_URL`, `JWT_SECRET` e `NODE_ENV=production`. Para produção real, habilite TLS no banco, secrets manager, backups/PITR, observabilidade e CDN/WAF.

## Arquitetura escolhida nesta entrega

Para transformar a definição do produto em algo executável imediatamente, esta baseline usa um serviço Node único servindo API e frontend. Isso reduz complexidade operacional na primeira subida e mantém separação lógica em API/DB/UI. Na evolução, o frontend pode ser migrado para React/Next sem alterar o modelo de domínio e APIs.

## Próxima sequência de implementação

1. CRUD completo de temporadas, categorias, pilotos e etapas.
2. Central da Etapa mobile-first com presença, sorteio, qualify, grid e resultados.
3. Motor determinístico de pontuação, bônus, penalidades, descartes e desempate.
4. Importador genérico + conciliação de nomes.
5. Perfil público completo do piloto e mural dos campeões.
6. Financeiro da organização, planos, pagamentos e concessões do ScoreRace.
7. Upload/links de mídia e patrocinadores.
8. Equipes e Endurance.
9. Comentarista Virtual e Raio-X sobre dados estruturados.
10. Marketplace (arquitetura já prevista, implementação posterior).

## Segurança antes de abrir ao público

Esta baseline contém controles essenciais, mas antes de usuários reais deve receber: rate limiting, recuperação de senha, MFA opcional, política de senha, validação/schema de payload, CSRF dedicado caso a topologia mude, logs centralizados, criptografia/segredo para identificadores pessoais, testes de autorização tenant-by-tenant e pipeline CI/CD.
