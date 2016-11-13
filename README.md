## CinnXPStarkMenu (CinnXPStarkMenu@NikoKrause)
A custom menu for Cinnamon based on the look of Windows 7 Menu, derived from StarkMenu@mintystark (fixed by bluedxca93).

This menu is adapted by me to look better with the CinnXP theme by petrucci4prez.

* https://www.dropbox.com/s/bd3jx8le1k5p2a0/CinnXPStarkMenu_Favorites.png?dl=0
* https://www.dropbox.com/s/r3i60ghmp3deorz/CinnXPStarkMenu_AllPrograms.png?dl=0

#### This applet works on:
Linux Mint 17.3 Cinnamon (Cinnamon-Version 2.8)

#### Installation guide:
See this review video of CinnXPStarkMenu by @BigDaddyonTech for installation instructions and for a preview before installing this applet:
https://www.youtube.com/watch?v=OmUpLNsWgC4

Or follow the following instructions:

1. Download ZIP
2. Extract "starkmenu-master.zip"
3. Rename the extracted "CinnXPStarkMenu-master" folder to "CinnXPStarkMenu@NikoKrause" 
   (This step is important, otherwise the applet won't work.)
4. Move "CinnXPStarkMenu@NikoKrause" folder to path "~/.local/share/cinnamon/applets/"
5. Add applet to panel

* For German Translation replace "settings-schema.json" file with "/languages/YOURLANGUAGE/settings-schema.json" file. --> Maybe you have to delete afterwards the "CinnXPStarkMenu@NikoKrause" folder in "~/.cinnamon/configs/" and restart Cinnamon with Ctrl+Alt+Esc

#### If in use with CinnXP theme by petrucci4prez you have to make some changes:
1. Open "CinnXP/cinnamon/cinnamon.css"
2. Add the following lines and save the file:

-------------------------------------------------------------------------------------------------
```
/* ===================================================================
 * CinnXPStarkMenu 
 * (if CinnXPStarkMenu is used, change some stuff, else use default)
 * ===================================================================*/
.right-buttons-box {
    background-color: #D3E5FA;
    padding: 8px;
}
.starkmenu-background {
	padding: 54px 1px 29px 1px;
}
.starkmenu-selected-app-box {
    color: black; /* Information, which is shown, if you select apps*/
}
.starkmenu-favorites-box {  
        background-color: white;
    border: 0px solid white;
}
.starkmenu-applications-box {
    padding: 0px 0px 0px 0px;
}
.starkmenu-applications-inner-box {
	background-color: white;
}
.starkmenu-applications-box StScrollView {
    border-right-width: 1px;
    border-bottom-width: 1px;
    background-color: #ece9d8;
    color: black;
}
.starkmenu-search-box {
	padding-bottom: 0px;
}
.hover-user-icon {
    border-radius: 4px;
    border: 6px solid transparent;
	border-image: url('box.png') 6 6 6 6;
}
.hover-icon {
	border: 6px solid transparent;
}
```
-------------------------------------------------------------------------------------------------

#### Credits and thanks to:
* @mintystark for the codebase
* @bluedxca93 who fixed it for Cinnamon 2.8
* @lestcape for helping me with add_style_class and for his Configurable-Menu, which helped me to fix the moving issues of the favorites buttons
* @linuxmint for Cinnamon and the default menu@cinnamon.org, from which I adapted most of the code and which helped me to understand more of the codebase
* @petrucci4prez for his great CinnXP theme, which was the main reason for me to start with coding this menu
* @BigDaddyonTech for his review video of CinnXPStarkMenu

###### ToDo and Bugs (help and hints are welcome):
* [Minor Bug] After removing favorite with largest name, the favorites box should resize while menu is still open, but it doesn't.
