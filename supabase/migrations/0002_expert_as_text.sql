-- Эксперт теперь хранится как имя/контакт на проекте, без отдельного user-аккаунта.
-- Старая колонка expert_id остаётся (на случай если кого-то всё же привяжем как пользователя),
-- но становится опциональной — основное поле теперь expert_name.

alter table projects add column if not exists expert_name text;

-- Заполним expert_name из связанного профиля для уже существующих проектов
update projects p
   set expert_name = coalesce(pr.full_name, pr.email)
  from profiles pr
 where p.expert_id = pr.id
   and p.expert_name is null;
