# Одна тема и несколько редакторов

`design-tokens.json` — владелец общих semantic tokens и light/dark значений.
`pnpm generate:theme` обновляет CSS; `pnpm check:theme` проверяет его соответствие.
JS presets используют тот же JSON. Не копируйте значения цветов в примеры.

`setTheme(mode, root?)` применяет тему к конкретному DOM root. Без root работает
с documentElement. `getTheme(root?)` и `onThemeChange(listener, root?)` относятся
к тому же root; разные экземпляры не меняют состояние и подписки друг друга.
`setTheme` возвращает cleanup системного media listener для unmount. Cleanup
старого вызова не отменяет listener нового вызова. Явные light/dark отключают
слежение за системой. Импорт и getTheme безопасны при SSR.

PageEditor допускает собственный контейнер с data-theme. Его диалоги и меню
наследуют тему контейнера. Для React/BlockEditor импортируйте base.css/theme.css;
для PageEditor — page.css. Таблицы и медиа используют общие style owners.
