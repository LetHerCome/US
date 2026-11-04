-- Le sei Atmosfere (founder, 04/11/2026; canvas «Widget, sfondi e Ricordi»,
-- tavola Atmosfere.dc.html). US starts on Vino, a dark wine gradient, for
-- everyone (the free look, no row). The theme rewards become gradients too and
-- three take a new name: Rosé is now Prugna, Mezzanotte is now Notte blu,
-- Grafite stays Grafite, with a silver sheen. Ids, levels and who unlocked what
-- stay as they are: a couple who had Rosé simply finds Prugna.
-- Content only: titles and descriptions of five catalog rows.

update public.progression_reward_catalog c
   set title = v.title, description = v.description
  from (values
    ('theme_rose', 'Prugna', 'Prugna in alto che scende nella notte: tutta US più morbida.'),
    ('theme_midnight', 'Notte blu', 'Blu notte che sfuma nel viola: US più calma e silenziosa.'),
    ('theme_film', 'Pellicola', 'Ambra e seppia che sfumano nel buio: US come una foto sviluppata a mano.'),
    ('theme_blue_hour', 'Ora blu', 'Il quarto d''ora dopo il tramonto: un blu freddo che sfuma nella notte.'),
    ('theme_graphite', 'Grafite', 'Grafite e argento, con un riflesso di luce: US essenziale, da rivista.')
  ) as v(id, title, description)
 where c.id = v.id;
