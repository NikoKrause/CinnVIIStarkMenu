# Changelog

## Table of contents

[Full Changelog v1.0...v1.2](https://github.com/NikoKrause/CinnVIIStarkMenu/compare/v1.0...v1.2)
[Full Changelog v0.0...v1.0](https://github.com/NikoKrause/CinnVIIStarkMenu/compare/v0.0...v1.0)

## Changes `v1.0`...`v1.2`
```
[NikoKrause]
* add applet version number in About...
* add Chinese (Simplified) (zh_CN) translation
* always center userIcon, even with userLabel shown
* update translations
* improve appsBoxWidth resizing

[Germán Franco]
* Fix small size after comming back from favorites

[NikoKrause]
* backport appsBoxWidth sizing and centering user icon, remove unused variable

[Germán Franco]
* Improve applet sizing

[NikoKrause]
* resize width of appsBox depending on appsButton with the max width

[Germán Franco]
* Natively center hover icon

[NikoKrause]
* move icon besides metadata, for ALT+TAB and Settings

[Germán Franco]
* Improve search entry sizing

[NikoKrause]
* fix height issue of menu, when switching between Fav<->AllProgs and when changing themes
* Update Translation Status in README

[Germán Franco]
* Change "All programs" button icon

[NikoKrause]
* add Czech translation
* add Croation language

```

## Changes `v0.0`...`v1.0`
```
[NikoKrause]
* add Logo to CinnVIIStarkMenu applet
* Add logo credits
* fix background dissappearing in CinnXP, when moving applet
* fix ngettext by replacing with dngettext & add SysInfo to sidebar
* update translation files
* replace mintinstall with printer in quicklauncher & update translation template
* change translation function thanks to lestcape

[Germán Franco]
* Fix missing home folder icon

[NikoKrause]
* 1. make menu hotkey binding per-instance & 2. remove keybinding when applet is removed from panel
* Fix the layout of the menu applet in vertical panels
* Update Translations (de,es,fr,ru) & add multiversion 3.2
* rephrased strings
* rephrased some strings (thanks @feren)
* Update l10n template
* Try/catch call to decodeURIComponent
* use ngettext for 'results found'
* add Russian (ru) l10n
* Update l10n template for 2.6
* added History and Translation info to Readme
* added support for Cinnamon 2.6
* add License
* add German (de) translation
* rename the last quicklinks to quicklauncher and update translation template
* updated translation template
* remove old de.po
* Rename applet to CinnVIIStarkMenu
* remove spaces
* query_exists not decoded & rearrange settings-schema
* add Cinnamon 3.2 version to metadata
* add multiversion support
* Tooltip improvements & showAppsDescriptionOnButtons added
* selectedApp Description fixes
*  Menu applet: Don't refresh twice at the same time.
* settings-schema updates
* change quicklink to quicklaunch & split label,symbol,command
* complete ToolTips and add number of found apps
* change contextMenu icons
* force push AllProgramsButton to the bottom & set width of searchEntry and AllProgramsButton only once (gets rid of warning, everytime you open the menu)
* typo and clean up
* menu applet: Remove visibility checks for button actors, ClutterActor
* replaced QuitButton/LogoutButton/LockscreenButton with TextBoxItem
* fix settings-schema (units) for LM 17.3
* remove old keynav code, which was there as comment
* fix empty quit label
* added switch to hide favorites button, fixed empty label issue, rephrased settings schema
* added checkbox to show icons for contextMenu
* force push shutdown box to the bottom
* fix update of custom labels Quit, Favs, AllApps
* fix scroll of category and deleting favorites
* fix drag&drop for LM 17.3
* Added keyboard navigation for context menus.
* code cleanup and fix keynav for favorites
* keynav: open context of favButtons with keys
* rewrite keynavigation No.3
* change switch to checkbox for compatibility with < 3.0
* rewrite keynavigation No.2
* rewrite keynavigation No.1
* menu applet: use app id instead of app name for searches
* Show 'Run with nVidia GPU' in context menu
* menu-applet: Add a setting for the new menu animations
* comparison with stock menu and code clean up No. 2 (finish)
* comparison with stock menu and code clean up No. 1
* remove Help button from quicklinks sidebar
* Vertical panels
* padding right buttons box
* padding buttons in right-buttons-box
* padding buttons in right-buttons-box
* typo in settings-schema and added style_class starkmenu-user-label
* quick and dirty hack of quit/lock/logout-button styles for cinnamoner, Elbullazul & feren
* minor change in translation files
* undo last commit
* added starkhover-user-icon style class
* changed way of translation to po files & added Tooltips to Favorites Buttons
* padding horizontal shutdown menu
* added MATE-Menu layout, did some padding issues, added option to hide username, changed horizontal shutdown menu layout, dropped addDescriptionBox and use instead Tooltips
* added layout, which looks similar to Mint menu for MATE & moved description of selected Apps to the bottom
* adapted everything I could from menu@cinnamon.org
* offload some work done as the menu is opening to an idle
* remove animation on menu opening and closing
* load limit number of icons on startup
* Delay loading the All Applications category until the menu has opened.
* padding issues again
* beautified code with: js_beautify applet.js
* padding issues
* code cleanup
* Split up refresh applications and refresh places/recent
* code cleanup: removed applicationsByCategory
* increased number of menu instances, which can be added to panel
* fixed keyboard navigation in categories box, which was broken because of previous autoscroll commit
* changed some category-button styles
* fixed autoscroll, i.e. autoscroll still worked though the checkbox was turned of
* made categories box wider
* contextMenu of favorite buttons closes, if menu is closed & bug fixed: favorites disappeared when uninstall in contextMenu of favorite buttons was clicked
* undo the commit before the last one & made categories box wider
* restored ability to right click on favorite buttons
* https://github.com/linuxmint/Cinnamon/commit/595f2013af4b9b2ef027d2c6b75bd5621f3eb26e
* https://github.com/linuxmint/Cinnamon/commit/b2426c5b6f6163cc97d0c6a7b75914042b806799
* https://github.com/linuxmint/Cinnamon/commit/f2525fa684221663cbc1871f109b53c5d06ee8c0
* added stakmenu-application-inner-box to get the color of application-box back to white
* added applications -inner-box and -outer-box & made applications-scrollbox wider
* deacreased favsWidth to 0.95*favsWidth
* dropping issues, see https://github.com/linuxmint/Cinnamon/issues/5322
* accept drop of Favorites on RightButtonsBox
* changed forward-icon on FavoritesButton to back-icon
* delete unused hover-label from stylesheet.css
* changed hover-label to user-label
* finally: padding of searchbox looks awesome with every theme
* theme-specific padding-issues
* cleaned code, adapted some code from menu@cinnamon.org, fixed broken TransientButton (i.e. now filesystem-search shows directories in applicationsBox)
* categories are now alphabetically sorted in menu
* fix previous commit, i.e. fixed filesystem-search
* last commit broke 'search filesystem in menu-searchbox', this should fix it again
* last commit broke 'search filesystem in menu-searchbox', this should fix it
* make menu keyboard navigable
* added seachprovidermanager
* added getVisibleIndex and getVisibleItem
* removed try catch block
* added initial_load_done
* fixed autoscroll of categories box
* major bug fixed: trying to drag an application caused freezing
* fix regression caused by previous commit
* menu applet: fix favorites and system buttons receiving incorrect styling and appearing non-reactive.
* updated images and added credits
* moved padding from theme specific cinnamon.css to local stylesheet.css
* added checkbox to show/hide application icons (thanks to code of menu@cinnamon.org)
* changed two default values in setting-schema.json
* fixed issue: when 'open menu when mouse moves over' was activated it was difficult to open the menu settings & fixed hover delay in categories
* updated settings-schema
* added checkbox to hide category icons (thanks to code of menu@cinnamon.org)
* fixed moving Favorites through DragAndDrop (thanks to code of ConfigurableMenu by lestcape)
* added 3 layouts for the shutdown menu
* newly installed applications are now highlighted & AllPrograms and Favorites have now the same height
* fixed add_to_panel-button and added uninstall-button on right click in menu
* changed gnome-logout and gnome-lockscreen icons to system-logout and system-lockscreen icons & fixed spacing issues if quicklinks option Only Icons was chosen
* shortened separators & added different spacing for locklogoutDropDownMenu
* Moved All Programms Text a little bit to the right
* mimized white between searchbar and bottom
* added Quicklink for Downloads directory and checkboxes to show/hide Quicklinks
* completed german translation and added checkbox to show/hide Quicklinks Logout Lock screen DropDownMenu
* add german language file for settings-schema.json
* changed some stuff, to make it look better with CinnXP theme
* Create README.md

[Gábor Dobra]
* Shortcut added to open overlay

[NikoKrause]
* refresh menu if you change icon theme
* missing comma added
* now "custom-icon" checkbox works
* added "menu-icon-custom" checkbox
* fixed show-recent and show-places checkboxes

```
