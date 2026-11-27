-- Piccolezze prima del rilascio (27/11/2026): the reward texts added on 26/11
-- (20261126000000_premi_oggi_effetti, 20261126010000_premi_simbolo,
-- 20261126020000_premi_temi_countdown) take the typographic apostrophe (’) of
-- the text review (20261113232109_revisione_testi): «Ora d’oro»,
-- «Oggi cambia con l’anno…», «Foglie d’acero e d’autunno…», «…dell’altra persona».
-- Only the title and description of those rows; re-applying changes nothing.
update public.progression_reward_catalog
   set title = replace(title, '''', '’'),
       description = replace(description, '''', '’')
 where id in (
         'oggi_theme_moonlight', 'oggi_effect_snow', 'oggi_theme_seasonal', 'oggi_effect_dandelions',
         'oggi_effect_leaves', 'oggi_effect_shooting', 'oggi_effect_lanterns', 'oggi_effect_memories',
         'effect_pulse', 'effect_constellation', 'effect_duo',
         'frame_aurora', 'ring_orbit', 'frame_chrome', 'oggi_theme_golden')
   and (strpos(title, '''') > 0 or strpos(description, '''') > 0);
