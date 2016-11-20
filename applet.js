const Applet = imports.ui.applet;
const Mainloop = imports.mainloop;
const CMenu = imports.gi.CMenu;
const Lang = imports.lang;
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const AppFavorites = imports.ui.appFavorites;
const Gtk = imports.gi.Gtk;
const Atk = imports.gi.Atk;
const Gio = imports.gi.Gio;
const Signals = imports.signals;
const GnomeSession = imports.misc.gnomeSession;
const ScreenSaver = imports.misc.screenSaver;
const FileUtils = imports.misc.fileUtils;
const Util = imports.misc.util;
const Tweener = imports.ui.tweener;
const DND = imports.ui.dnd;
const Meta = imports.gi.Meta;
const DocInfo = imports.misc.docInfo;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const Pango = imports.gi.Pango;
const SearchProviderManager = imports.ui.searchProviderManager;

const AccountsService = imports.gi.AccountsService;
const Tooltips = imports.ui.tooltips;
const Session = new GnomeSession.SessionManager();

const ICON_SIZE = 16;
const MAX_FAV_ICON_SIZE = 64;
const CATEGORY_ICON_SIZE = 22;
const APPLICATION_ICON_SIZE = 22;
const MAX_RECENT_FILES = 20;
const HOVER_ICON_SIZE = 48;

const INITIAL_BUTTON_LOAD = 30;
const MAX_BUTTON_WIDTH = "max-width: 20em;";

const USER_DESKTOP_PATH = FileUtils.getUserDesktopDir();

const PRIVACY_SCHEMA = "org.cinnamon.desktop.privacy";
const REMEMBER_RECENT_KEY = "remember-recent-files";

let appsys = Cinnamon.AppSystem.get_default();
let visiblePane = "favs";

/* VisibleChildIterator takes a container (boxlayout, etc.)
 * and creates an array of its visible children and their index
 * positions.  We can then work through that list without
 * mucking about with positions and math, just give a
 * child, and it'll give you the next or previous, or first or
 * last child in the list.
 *
 * We could have this object regenerate off a signal
 * every time the visibles have changed in our applicationBox,
 * but we really only need it when we start keyboard
 * navigating, so increase speed, we reload only when we
 * want to use it.
 */

function VisibleChildIterator(container) {
    this._init(container);
}

VisibleChildIterator.prototype = {
    _init: function(container) {
        this.container = container;
        this.reloadVisible();
    },

    reloadVisible: function() {
        this.array = this.container.get_focus_chain()
            .filter(x => !(x._delegate instanceof PopupMenu.PopupSeparatorMenuItem));
    },

    getNextVisible: function(curChild) {
        return this.getVisibleItem(this.array.indexOf(curChild) + 1);
    },

    getPrevVisible: function(curChild) {
        return this.getVisibleItem(this.array.indexOf(curChild) - 1);
    },

    getFirstVisible: function() {
        return this.array[0];
    },

    getLastVisible: function() {
        return this.array[this.array.length - 1];
    },

    getVisibleIndex: function(curChild) {
        return this.array.indexOf(curChild);
    },

    getVisibleItem: function(index) {
        let len = this.array.length;
        index = ((index % len) + len) % len;
        return this.array[index];
    },

    getNumVisibleChildren: function() {
        return this.array.length;
    },

    getAbsoluteIndexOfChild: function(child) {
        return this.container.get_children().indexOf(child);
    }
};

function ApplicationContextMenuItem(appButton, label, action) {
    this._init(appButton, label, action);
}

ApplicationContextMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (appButton, label, action) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {focusOnHover: false});

        this._appButton = appButton;
        this._action = action;
        this.label = new St.Label({ text: label });
        this.addActor(this.label);
    },

    activate: function (event) {
        switch (this._action){
            case "add_to_panel":
                if (!Main.AppletManager.get_role_provider_exists(Main.AppletManager.Roles.PANEL_LAUNCHER)) {
                    let new_applet_id = global.settings.get_int("next-applet-id");
                    global.settings.set_int("next-applet-id", (new_applet_id + 1));
                    let enabled_applets = global.settings.get_strv("enabled-applets");
                    enabled_applets.push("panel1:right:0:panel-launchers@cinnamon.org:" + new_applet_id);
                    global.settings.set_strv("enabled-applets", enabled_applets);
                }

                let launcherApplet = Main.AppletManager.get_role_provider(Main.AppletManager.Roles.PANEL_LAUNCHER);
                launcherApplet.acceptNewLauncher(this._appButton.app.get_id());

                this._appButton.toggleMenu();
                break;
            case "add_to_desktop":
                let file = Gio.file_new_for_path(this._appButton.app.get_app_info().get_filename());
                let destFile = Gio.file_new_for_path(USER_DESKTOP_PATH+"/"+this._appButton.app.get_id());
                try{
                    file.copy(destFile, 0, null, function(){});
                    // Need to find a way to do that using the Gio library, but modifying the access::can-execute attribute on the file object seems unsupported
                    Util.spawnCommandLine("chmod +x \""+USER_DESKTOP_PATH+"/"+this._appButton.app.get_id()+"\"");
                }catch(e){
                    global.log(e);
                }
                this._appButton.toggleMenu();
                break;
            case "add_to_favorites":
                AppFavorites.getAppFavorites().addFavorite(this._appButton.app.get_id());
                this._appButton.toggleMenu();
                break;
            case "remove_from_favorites":
                AppFavorites.getAppFavorites().removeFavorite(this._appButton.app.get_id());
                this._appButton.toggleMenu();
                break;
            case "uninstall":
                Util.spawnCommandLine("gksu -m '" + _("Please provide your password to uninstall this application") + "' /usr/bin/cinnamon-remove-application '" + this._appButton.app.get_app_info().get_filename() + "'");
                this._appButton.appsMenuButton.menu.close();
                break;
            case "run_with_nvidia_gpu":
                Util.spawnCommandLine("optirun gtk-launch " + this._appButton.app.get_id());
                this._appButton.appsMenuButton.menu.close();
                break;
        }
        return false;
    }

};

function GenericApplicationButton(appsMenuButton, app) {
    this._init(appsMenuButton, app);
}

GenericApplicationButton.prototype = {
    __proto__: PopupMenu.PopupSubMenuMenuItem.prototype,

    _init: function(appsMenuButton, app, withMenu) {
        this.app = app;
        this.appsMenuButton = appsMenuButton;
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});

        this.withMenu = withMenu;
        if (this.withMenu){
            this.menu = new PopupMenu.PopupSubMenu(this.actor);
            this.menu.actor.set_style_class_name('menu-context-menu');
            this.menu.connect('open-state-changed', Lang.bind(this, this._subMenuOpenStateChanged));
        }
    },

    highlight: function() {
        this.actor.add_style_pseudo_class('highlighted');
    },

    unhighlight: function() {
        var app_key = this.app.get_id();
        if (app_key == null) {
            app_key = this.app.get_name() + ":" + this.app.get_description();
        }
        this.appsMenuButton._knownApps.push(app_key);
        this.actor.remove_style_pseudo_class('highlighted');
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button()==1){
            this.activate(event);
        }
        if (event.get_button()==3){
            this.activateContextMenus(event);
        }
        return true;
    },

    activate: function(event) {
        this.unhighlight();
        this.app.open_new_window(-1);
        this.appsMenuButton.menu.close();
    },

    activateContextMenus: function(event) {
        if (this.withMenu && !this.menu.isOpen)
            this.appsMenuButton.closeContextMenus(this.app, true);
        this.toggleMenu();
    },

    closeMenu: function() {
        if (this.withMenu) this.menu.close();
    },

    toggleMenu: function() {
        if (!this.withMenu) return;

        if (!this.menu.isOpen){
            let children = this.menu.box.get_children();
            for (var i in children) {
                this.menu.box.remove_actor(children[i]);
            }
            let menuItem;
            menuItem = new ApplicationContextMenuItem(this, _("Add to panel"), "add_to_panel");
            this.menu.addMenuItem(menuItem);
            if (USER_DESKTOP_PATH){
                menuItem = new ApplicationContextMenuItem(this, _("Add to desktop"), "add_to_desktop");
                this.menu.addMenuItem(menuItem);
            }
            if (AppFavorites.getAppFavorites().isFavorite(this.app.get_id())){
                menuItem = new ApplicationContextMenuItem(this, _("Remove from favorites"), "remove_from_favorites");
                this.menu.addMenuItem(menuItem);
            }else{
                menuItem = new ApplicationContextMenuItem(this, _("Add to favorites"), "add_to_favorites");
                this.menu.addMenuItem(menuItem);
            }
            if (this.appsMenuButton._canUninstallApps) {
                menuItem = new ApplicationContextMenuItem(this, _("Uninstall"), "uninstall");
                this.menu.addMenuItem(menuItem);
            }
            if (this.appsMenuButton._isBumblebeeInstalled) {
                menuItem = new ApplicationContextMenuItem(this, _("Run with nVidia GPU"), "run_with_nvidia_gpu");
                this.menu.addMenuItem(menuItem);
            }
        }
        this.menu.toggle();
    },

    _subMenuOpenStateChanged: function() {
        if (this.menu.isOpen) {
            this.appsMenuButton._activeContextMenuParent = this;
            this.appsMenuButton._scrollToButton(this.menu);
        } else {
            this.appsMenuButton._activeContextMenuItem = null;
            this.appsMenuButton._activeContextMenuParent = null;
        }
    },

    get _contextIsOpen() {
        return this.menu.isOpen;
    }
}

function TransientButton(appsMenuButton, pathOrCommand) {
    this._init(appsMenuButton, pathOrCommand);
}

TransientButton.prototype = {
    __proto__: PopupMenu.PopupSubMenuMenuItem.prototype,

    _init: function(appsMenuButton, pathOrCommand) {
        let displayPath = pathOrCommand;
        if (pathOrCommand.charAt(0) == '~') {
            pathOrCommand = pathOrCommand.slice(1);
            pathOrCommand = GLib.get_home_dir() + pathOrCommand;
        }

        this.isPath = pathOrCommand.substr(pathOrCommand.length - 1) == '/';
        if (this.isPath) {
            this.path = pathOrCommand;
        } else {
            let n = pathOrCommand.lastIndexOf('/');
            if (n != 1) {
                this.path = pathOrCommand.substr(0, n);
            }
        }

        this.pathOrCommand = pathOrCommand;

        this.appsMenuButton = appsMenuButton;
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});

        // We need this fake app to help appEnterEvent/appLeaveEvent
        // work with our search result.
        this.app = {
            get_app_info: {
                get_filename: function() {
                    return pathOrCommand;
                }
            },
            get_id: function() {
                return -1;
            },
            get_description: function() {
                return this.pathOrCommand;
            },
            get_name: function() {
                return '';
            }
        };



        let iconBox = new St.Bin();
        this.file = Gio.file_new_for_path(this.pathOrCommand);

        try {
            this.handler = this.file.query_default_handler(null);
            let icon_uri = this.file.get_uri();
            let fileInfo = this.file.query_info(Gio.FILE_ATTRIBUTE_STANDARD_TYPE, Gio.FileQueryInfoFlags.NONE, null);
            let contentType = Gio.content_type_guess(this.pathOrCommand, null);
            let themedIcon = Gio.content_type_get_icon(contentType[0]);
            this.icon = new St.Icon({gicon: themedIcon, icon_size: APPLICATION_ICON_SIZE, icon_type: St.IconType.FULLCOLOR });
            this.actor.set_style_class_name('menu-application-button');
        } catch (e) {
            this.handler = null;
            let iconName = this.isPath ? 'folder' : 'unknown';
            this.icon = new St.Icon({icon_name: iconName, icon_size: APPLICATION_ICON_SIZE, icon_type: St.IconType.FULLCOLOR,});
            // @todo Would be nice to indicate we don't have a handler for this file.
            this.actor.set_style_class_name('menu-application-button');
        }

        this.addActor(this.icon);

        this.label = new St.Label({ text: displayPath, style_class: 'menu-application-button-label' });
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_style(MAX_BUTTON_WIDTH);
        this.addActor(this.label);
        this.isDraggableApp = false;
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button()==1){
            this.activate(event);
        }
        return true;
    },

    activate: function(event) {
        if (this.handler != null) {
            this.handler.launch([this.file], null)
        } else {
            // Try anyway, even though we probably shouldn't.
            try {
                Util.spawn(['gvfs-open', this.file.get_uri()])
            } catch (e) {
                global.logError("No handler available to open " + this.file.get_uri());
            }

        }

        this.appsMenuButton.menu.close();
    }
}

String.prototype.replaceAt=function(index, character) {
    return this.substr(0, index) + character + this.substr(index+character.length);
}

function ApplicationButton(appsMenuButton, app, showIcon) {
    this._init(appsMenuButton, app, showIcon);
}

ApplicationButton.prototype = {
    __proto__: GenericApplicationButton.prototype,

    _init: function(appsMenuButton, app, showIcon) {
        GenericApplicationButton.prototype._init.call(this, appsMenuButton, app, true);
        this.category = new Array();
        this.actor.set_style_class_name('menu-application-button');

        if (showIcon) {
            this.icon = this.app.create_icon_texture(APPLICATION_ICON_SIZE)
            this.addActor(this.icon);
        }
        this.name = this.app.get_name();
        this.label = new St.Label({ text: this.name, style_class: 'menu-application-button-label' });
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_style(MAX_BUTTON_WIDTH);
        this.addActor(this.label);
        this._draggable = DND.makeDraggable(this.actor);
        this._draggable.connect('drag-end', Lang.bind(this, this._onDragEnd));
        this.isDraggableApp = true;
        this.actor.label_actor = this.label;
        if (showIcon) {
            this.icon.realize();
        }
        this.label.realize();


        let appDescriptionTooltipString = this.app.get_description() + "";
        let lastSpacePosition = 0;
        if(appDescriptionTooltipString.length > 80) {
            lastSpacePosition = appDescriptionTooltipString.lastIndexOf(" ", 79);
            appDescriptionTooltipString = appDescriptionTooltipString.replaceAt(lastSpacePosition, "\n");
        }
        if(appDescriptionTooltipString.length > 160) {
            lastSpacePosition = appDescriptionTooltipString.lastIndexOf(" ", lastSpacePosition+80);
            appDescriptionTooltipString = appDescriptionTooltipString.replaceAt(lastSpacePosition, "\n");
        }

        if(appDescriptionTooltipString == "null")
            this.tooltip = new Tooltips.Tooltip(this.actor, _("No description available"));
        else
            this.tooltip = new Tooltips.Tooltip(this.actor, appDescriptionTooltipString);

    },

    get_app_id: function() {
        return this.app.get_id();
    },

    getDragActor: function() {
        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let nbFavorites = favorites.length;
        let monitorHeight = Main.layoutManager.primaryMonitor.height;
        let real_size = (0.7 * monitorHeight) / nbFavorites;
        let icon_size = 0.6 * real_size;
        if (icon_size > MAX_FAV_ICON_SIZE)
            icon_size = MAX_FAV_ICON_SIZE;
        return this.app.create_icon_texture(icon_size);
    },

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource: function() {
        return this.actor;
    },

    _onDragEnd: function() {
        this.appsMenuButton.favoritesBox._delegate._clearDragPlaceholder();
    }
};

function SearchProviderResultButton(appsMenuButton, provider, result) {
    this._init(appsMenuButton, provider, result);
}

SearchProviderResultButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(appsMenuButton, provider, result) {
        this.provider = provider;
        this.result = result;

        this.appsMenuButton = appsMenuButton;
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.actor.set_style_class_name('menu-application-button');

        // We need this fake app to help appEnterEvent/appLeaveEvent
        // work with our search result.
        this.app = {
            get_app_info: {
                get_filename: function() {
                    return result.id;
                }
            },
            get_id: function() {
                return -1;
            },
            get_description: function() {
                return result.description;
            },
            get_name: function() {
                return result.label;
            }
        };

        this.icon = null;
        if (result.icon){
            this.icon = result.icon;
        }else if (result.icon_app){
            this.icon = result.icon_app.create_icon_texture(APPLICATION_ICON_SIZE);
        }else if (result.icon_filename){
            this.icon = new St.Icon({gicon: new Gio.FileIcon({file: Gio.file_new_for_path(result.icon_filename)}), icon_size: APPLICATION_ICON_SIZE});
        }

        if (this.icon){
            this.addActor(this.icon);
        }
        this.label = new St.Label({ text: result.label, style_class: 'menu-application-button-label' });
        this.addActor(this.label);
        this.isDraggableApp = false;
        if (this.icon) {
            this.icon.realize();
        }
        this.label.realize();
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button() == 1){
            this.activate(event);
        }
        return true;
    },

    activate: function(event) {
        try{
            this.provider.on_result_selected(this.result);
            this.appsMenuButton.menu.close();
        }
        catch(e)
        {
            global.logError(e);
        }
    }
}

function PlaceButton(appsMenuButton, place, button_name, showIcon) {
    this._init(appsMenuButton, place, button_name, showIcon);
}

PlaceButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(appsMenuButton, place, button_name, showIcon) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.appsMenuButton = appsMenuButton;
        this.place = place;
        this.button_name = button_name;
        this.actor.set_style_class_name('menu-application-button');
        this.actor._delegate = this;
        this.label = new St.Label({ text: this.button_name, style_class: 'menu-application-button-label' });
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_style(MAX_BUTTON_WIDTH);
        if (showIcon) {
            this.icon = place.iconFactory(APPLICATION_ICON_SIZE);
            if (!this.icon)
                this.icon = new St.Icon({icon_name: "folder", icon_size: APPLICATION_ICON_SIZE, icon_type: St.IconType.FULLCOLOR});
            if (this.icon)
                this.addActor(this.icon);
        }
        this.addActor(this.label);
        if (showIcon)
            this.icon.realize();
        this.label.realize();
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button()==1){
            this.place.launch();
            this.appsMenuButton.menu.close();
        }
    },

    activate: function(event) {
        this.place.launch();
        this.appsMenuButton.menu.close();
    }
};

function RecentContextMenuItem(recentButton, label, is_default, callback) {
    this._init(recentButton, label, is_default, callback);
}

RecentContextMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (recentButton, label, is_default, callback) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {focusOnHover: false});

        this._recentButton = recentButton;
        this._callback = callback;
        this.label = new St.Label({ text: label });
        this.addActor(this.label);

        if (is_default)
            this.label.style = "font-weight: bold;";
    },

    activate: function (event) {
        this._callback()
        return false;
    }
};

function RecentButton(appsMenuButton, file, showIcon) {
    this._init(appsMenuButton, file, showIcon);
}

RecentButton.prototype = {
    __proto__: PopupMenu.PopupSubMenuMenuItem.prototype,

    _init: function(appsMenuButton, file, showIcon) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.file = file;
        this.appsMenuButton = appsMenuButton;
        this.button_name = this.file.name;
        this.actor.set_style_class_name('menu-application-button');
        this.actor._delegate = this;
        this.label = new St.Label({ text: this.button_name, style_class: 'menu-application-button-label' });
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_style(MAX_BUTTON_WIDTH);
        if (showIcon) {
            this.icon = file.createIcon(APPLICATION_ICON_SIZE);
            this.addActor(this.icon);
        }
        this.addActor(this.label);
        if (showIcon)
            this.icon.realize();
        this.label.realize();

        this.menu = new PopupMenu.PopupSubMenu(this.actor);
        this.menu.actor.set_style_class_name('menu-context-menu');
        this.menu.connect('open-state-changed', Lang.bind(this, this._subMenuOpenStateChanged));
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button()==1){
            this.activate(event);
        }
        if (event.get_button()==3){
            this.activateContextMenus(event);
        }
        return true;
    },

    activate: function(event) {
        this.file.launch();
        this.appsMenuButton.menu.close();
    },

    activateContextMenus: function(event) {
        if (!this.menu.isOpen)
            this.appsMenuButton.closeContextMenus(this, true);
        this.toggleMenu();
    },

    closeMenu: function() {
        this.menu.close();
    },

    hasLocalPath: function(file) {
        return file.is_native() || file.get_path() != null;
    },

    toggleMenu: function() {
        if (!this.menu.isOpen){
            let children = this.menu.box.get_children();
            for (var i in children) {
                this.menu.box.remove_actor(children[i]);
            }
            let menuItem;

            menuItem = new PopupMenu.PopupMenuItem(_("Open with"), { reactive: false });
            menuItem.actor.style = "font-weight: bold";
            this.menu.addMenuItem(menuItem);

            let file = Gio.File.new_for_uri(this.file.uri);

            let default_info = Gio.AppInfo.get_default_for_type(this.file.mimeType, !this.hasLocalPath(file));

            if (default_info) {
                menuItem = new RecentContextMenuItem(this,
                                                     default_info.get_display_name(),
                                                     false,
                                                     Lang.bind(this, function() {
                                                         default_info.launch([file], null, null);
                                                         this.toggleMenu();
                                                         this.appsMenuButton.menu.close();
                                                     }));
                this.menu.addMenuItem(menuItem);
            }

            let infos = Gio.AppInfo.get_all_for_type(this.file.mimeType)

            for (let i = 0; i < infos.length; i++) {
                let info = infos[i];

                file = Gio.File.new_for_uri(this.file.uri);

                if (!this.hasLocalPath(file) && !info.supports_uris())
                    continue;

                if (info.equal(default_info))
                    continue;

                menuItem = new RecentContextMenuItem(this,
                                                     info.get_display_name(),
                                                     false,
                                                     Lang.bind(this, function() {
                                                         info.launch([file], null, null);
                                                         this.toggleMenu();
                                                         this.appsMenuButton.menu.close();
                                                     }));
                this.menu.addMenuItem(menuItem);
            }

            if (GLib.find_program_in_path ("nemo-open-with") != null) {
                menuItem = new RecentContextMenuItem(this,
                                                     _("Other application..."),
                                                     false,
                                                     Lang.bind(this, function() {
                                                         Util.spawnCommandLine("nemo-open-with " + this.file.uri);
                                                         this.toggleMenu();
                                                         this.appsMenuButton.menu.close();
                                                     }));
                this.menu.addMenuItem(menuItem);
            }
        }
        this.menu.toggle();
    },

    _subMenuOpenStateChanged: function() {
        if (this.menu.isOpen) {
            this.appsMenuButton._activeContextMenuParent = this;
            this.appsMenuButton._scrollToButton(this.menu);
        } else {
            this.appsMenuButton._activeContextMenuItem = null;
            this.appsMenuButton._activeContextMenuParent = null;
        }
    },

    get _contextIsOpen() {
        return this.menu.isOpen;
    }
};

function GenericButton(label, icon, reactive, callback) {
    this._init(label, icon, reactive, callback);
}

GenericButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(label, icon, reactive, callback) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.actor.set_style_class_name('menu-application-button');
        this.actor._delegate = this;
        this.button_name = "";

        this.label = new St.Label({ text: label, style_class: 'menu-application-button-label' });
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_style(MAX_BUTTON_WIDTH);

        if (icon != null) {
            let icon_actor = new St.Icon({ icon_name: icon, icon_type: St.IconType.FULLCOLOR, icon_size: APPLICATION_ICON_SIZE});
            this.addActor(icon_actor);
        }

        this.addActor(this.label);
        this.label.realize();

        this.actor.reactive = reactive;
        this.callback = callback;

        this.menu = new PopupMenu.PopupSubMenu(this.actor);
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button() == 1) {
            this.callback();
        }
    }
}

function RecentClearButton(appsMenuButton) {
    this._init(appsMenuButton);
}

RecentClearButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(appsMenuButton) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.appsMenuButton = appsMenuButton;
        this.actor.set_style_class_name('menu-application-button');
        this.button_name = _("Clear list");
        this.actor._delegate = this;
        this.label = new St.Label({ text: this.button_name, style_class: 'menu-application-button-label' });
        this.icon = new St.Icon({ icon_name: 'edit-clear', icon_type: St.IconType.SYMBOLIC, icon_size: APPLICATION_ICON_SIZE });
        this.addActor(this.icon);
        this.addActor(this.label);

        this.menu = new PopupMenu.PopupSubMenu(this.actor);
    },

    _onButtonReleaseEvent: function (actor, event) {
        if (event.get_button()==1){
            this.activate(event);
        }
    },

    activate: function(event) {
        this.appsMenuButton.menu.close();
        let GtkRecent = new Gtk.RecentManager();
        GtkRecent.purge_items();
    }
};

function CategoryButton(app, showIcon) {
    this._init(app, showIcon);
}

CategoryButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(category, showIcon) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});

        this.actor.set_style_class_name('menu-category-button');
        var label;
        let icon = null;
        if (category) {
            if (showIcon) {
                icon = category.get_icon();
                if (icon && icon.get_names)
                    this.icon_name = icon.get_names().toString();
                else
                    this.icon_name = "";
            } else {
                this.icon_name = "";
            }
            label = category.get_name();
        } else
            label = _("All Applications");

        this.actor._delegate = this;
        this.label = new St.Label({ text: label, style_class: 'menu-category-button-label' });
        if (category && this.icon_name) {
            this.icon = St.TextureCache.get_default().load_gicon(null, icon, CATEGORY_ICON_SIZE);
            if (this.icon) {
                this.addActor(this.icon);
                this.icon.realize();
            }
        }
        this.actor.accessible_role = Atk.Role.LIST_ITEM;
        this.addActor(this.label);
        this.label.realize();
    }
};

function PlaceCategoryButton(app, showIcon) {
    this._init(app, showIcon);
}

PlaceCategoryButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(category, showIcon) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.actor.set_style_class_name('menu-category-button');
        this.actor._delegate = this;
        this.label = new St.Label({ text: _("Places"), style_class: 'menu-category-button-label' });
        if (showIcon) {
            this.icon = new St.Icon({icon_name: "folder", icon_size: CATEGORY_ICON_SIZE, icon_type: St.IconType.FULLCOLOR});
            this.addActor(this.icon);
            this.icon.realize();
        } else {
            this.icon = null;
        }
        this.addActor(this.label);
        this.label.realize();
    }
};

function RecentCategoryButton(app, showIcon) {
    this._init(app, showIcon);
}

RecentCategoryButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(category, showIcon) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {hover: false});
        this.actor.set_style_class_name('menu-category-button');
        this.actor._delegate = this;
        this.label = new St.Label({ text: _("Recent Files"), style_class: 'menu-category-button-label' });
        if (showIcon) {
            this.icon = new St.Icon({icon_name: "folder-recent", icon_size: CATEGORY_ICON_SIZE, icon_type: St.IconType.FULLCOLOR});
            this.addActor(this.icon);
            this.icon.realize();
        } else {
            this.icon = null;
        }
        this.addActor(this.label);
        this.label.realize();
    }
};

function FavoritesButton(appsMenuButton, app, nbFavorites, iconSize) {
    this._init(appsMenuButton, app, nbFavorites, iconSize);
}

FavoritesButton.prototype = {
    __proto__: GenericApplicationButton.prototype,

    _init: function(appsMenuButton, app, nbFavorites, iconSize) {
        GenericApplicationButton.prototype._init.call(this, appsMenuButton, app, true);
        let monitorHeight = Main.layoutManager.primaryMonitor.height;
        let real_size = (0.7 * monitorHeight) / nbFavorites;
        let icon_size = iconSize; //0.6*real_size;
        if (icon_size > MAX_FAV_ICON_SIZE)
            icon_size = MAX_FAV_ICON_SIZE;
        this.actor.style = "padding-top: "+(icon_size / 3)+"px;padding-bottom: "+(icon_size / 3)+"px; margin:auto;"

        this.actor.add_style_class_name('menu-favorites-button');
        let icon = app.create_icon_texture(icon_size);

        this.addActor(icon);
        icon.realize();

        this.label = new St.Label({ text: this.app.get_name(), style_class: 'menu-application-button-label' });
        this.addActor(this.label);

        this._draggable = DND.makeDraggable(this.actor);
        this._draggable.connect('drag-end', Lang.bind(this, this._onDragEnd));
        this.isDraggableApp = true;

        let appDescriptionTooltipString = this.app.get_description() + "";
        let lastSpacePosition = 0;
        if(appDescriptionTooltipString.length > 80) {
            lastSpacePosition = appDescriptionTooltipString.lastIndexOf(" ", 79);
            appDescriptionTooltipString = appDescriptionTooltipString.replaceAt(lastSpacePosition, "\n");
        }
        if(appDescriptionTooltipString.length > 160) {
            lastSpacePosition = appDescriptionTooltipString.lastIndexOf(" ", lastSpacePosition+80);
            appDescriptionTooltipString = appDescriptionTooltipString.replaceAt(lastSpacePosition, "\n");
        }

        if(appDescriptionTooltipString == "null")
            this.tooltip = new Tooltips.Tooltip(this.actor, _("No description available"));
        else
            this.tooltip = new Tooltips.Tooltip(this.actor, appDescriptionTooltipString);
    },

    _onDragEnd: function() {
        this.actor.get_parent()._delegate._clearDragPlaceholder();
    },

    get_app_id: function() {
        return this.app.get_id();
    },

    getDragActor: function() {
        return new Clutter.Clone({ source: this.actor });
    },

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource: function() {
        return this.actor;
    }
};

function AppPopupSubMenuMenuItem() {
    this._init.apply(this, arguments);
}

AppPopupSubMenuMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, hide_expander) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

        this.actor.add_style_class_name('popup-submenu-menu-item');

        let table = new St.Table({
            homogeneous: false,
            reactive: true
        });

        if (!hide_expander) {
            this._triangle = new St.Icon({
                icon_name: "media-playback-start",
                icon_type: St.IconType.SYMBOLIC,
                style_class: 'popup-menu-icon'
            });

            table.add(this._triangle, {
                row: 0,
                col: 0,
                col_span: 1,
                x_expand: false,
                x_align: St.Align.START
            });

            this.label = new St.Label({
                text: text
            });
            this.label.set_margin_left(6.0);
            table.add(this.label, {
                row: 0,
                col: 1,
                col_span: 1,
                x_align: St.Align.START
            });
        }
        else {
            this.label = new St.Label({
                text: text
            });
            table.add(this.label, {
                row: 0,
                col: 0,
                col_span: 1,
                x_align: St.Align.START
            });
        }
        this.actor.label_actor = this.label;
        this.addActor(table, {
            expand: true,
            span: 1,
            align: St.Align.START
        });

        this.menu = new PopupMenu.PopupSubMenu(this.actor, this._triangle);
        this.menu.connect('open-state-changed', Lang.bind(this, this._subMenuOpenStateChanged));
    },

    _subMenuOpenStateChanged: function(menu, open) {
        this.actor.change_style_pseudo_class('open', open);
    },

    destroy: function() {
        this.menu.destroy();
        PopupBaseMenuItem.prototype.destroy.call(this);
    },

    /*_onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();

        if (symbol == Clutter.KEY_Right) {
            this.menu.open(true);
            this.menu.actor.navigate_focus(null, Gtk.DirectionType.DOWN, false);
            return true;
        } else if (symbol == Clutter.KEY_Left && this.menu.isOpen) {
            this.menu.close();
            return true;
        }

        return PopupMenu.PopupBaseMenuItem.prototype._onKeyPressEvent.call(this, actor, event);
    },*/

    activate: function(event) {
        this.menu.open(true);
    },

    _onButtonReleaseEvent: function(actor) {
        this.menu.toggle();
    }
};

function QuitButton(label, icon, func, parent, hoverIcon) {
    this._init(label, icon, func, parent, hoverIcon);
}

QuitButton.prototype = {
    __proto__: AppPopupSubMenuMenuItem.prototype,

    _init: function(label, icon, func, parent, hoverIcon) {
        this.parent = parent;
        this.hoverIcon = hoverIcon;
        this.icon = icon;
        this.func = func;
        this.active = false;
        AppPopupSubMenuMenuItem.prototype._init.call(this, label);

        this.actor.set_style_class_name('menu-category-button');
        this.actor.add_style_class_name('menu-text-item-button');
        this.actor.add_style_class_name('starkmenu-quit-button');
        this.actor.connect('leave-event', Lang.bind(this, this._onLeaveEvent));
        //this.removeActor(this.label);
        this.label.destroy();
        //this.removeActor(this._triangle);
        this._triangle.destroy();
        this._triangle = new St.Label();
        this.label_text = label;

        if(this.label_text == "") {
            this.label_text = "  "
            this.leftLabel = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.leftLabel.add_style_class_name('starkmenu-quit-button-label');
            this.addActor(this.leftLabel);
            //this.actor.style = "padding-top: 4px; padding-bottom: 4px;";
        }

        this.label_icon = new St.Icon({
            icon_name: this.icon,
            icon_size: 18,
            icon_type: St.IconType.FULLCOLOR,
        });

        this.label = new St.Label({
            text: this.label_text,
            style_class: 'menu-category-button-label'
        });
        this.label.add_style_class_name('starkmenu-quit-button-label');

        this.addActor(this.label_icon);
        this.labelIconAdded = true;
        this.addActor(this.label);
        this.labelAdded = true;
    },

    _update: function(quicklinkOptions, QuicklinksShutdownMenuOptions) {

        if (this.labelAdded) {
            this.removeActor(this.label);
            this.labelAdded = false;
        }
        if (this.labelIconAdded) {
            this.removeActor(this.label_icon);
            this.labelIconAdded = false;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'icons' || QuicklinksShutdownMenuOptions == "horizontal") {

            let iconSize = 18;
            if(quicklinkOptions == 'icons')
                iconSize = 26;
            else if(QuicklinksShutdownMenuOptions == "horizontal")
                iconSize = 22;
            else
                iconSize = 18;

            this.name_icon = new St.Icon({
                icon_name: this.icon,
                icon_size: iconSize,
                icon_type: St.IconType.FULLCOLOR,
            });

            let iconFileName = this.icon;
            let iconFile = Gio.file_new_for_path(iconFileName);
            let icon;

            if (iconFile.query_exists(null)) {
                icon = new Gio.FileIcon({
                    file: iconFile
                });
            } else {
                icon = new Gio.ThemedIcon({
                    name: this.icon
                });
            }

            this.label_icon.set_gicon(icon);
            this.label_icon.set_icon_size(iconSize);

            if (!iconFile.query_exists(null)) {
                this.label_icon = this.name_icon;

            }

            this.addActor(this.label_icon);
            this.labelIconAdded = true;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'labels') {
            this.label = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.label.add_style_class_name('starkmenu-quit-button-label');
            this.addActor(this.label);
            this.labelAdded = true;
        }
    },

    _onLeaveEvent: function() {
        this.hoverIcon.showUser = true;
        Tweener.addTween(this, {
            time: 1,
            onComplete: function() {
                if (!this.active) {
                    this.hoverIcon._onUserChanged();
                }
            }
        });
    },

    setActive: function(active) {
        if (active) {
            this.hoverIcon.showUser = false;
            this.actor.set_style_class_name('menu-category-button-selected');
            this.actor.add_style_class_name('starkmenu-quit-button-selected');
            if (this.parent.quicklinkOptions != 'icons') {
                this.hoverIcon._refresh(this.icon);
            }
        } else {
            this.actor.set_style_class_name('menu-category-button');
            this.actor.add_style_class_name('starkmenu-quit-button');
        }
    },

    _onButtonReleaseEvent: function(actor, event) {
        if (event.get_button() == 1) {
            this.activate(event);
        }
    },

    activate: function(event) {
        eval(this.func);
        this.parent.close();
    }
};

function LogoutButton(label, icon, func, parent, hoverIcon) {
    this._init(label, icon, func, parent, hoverIcon);
}

LogoutButton.prototype = {
    __proto__: AppPopupSubMenuMenuItem.prototype,

    _init: function(label, icon, func, parent, hoverIcon) {
        this.parent = parent;
        this.hoverIcon = hoverIcon;
        this.icon = icon;
        this.func = func;
        this.active = false;
        AppPopupSubMenuMenuItem.prototype._init.call(this, label);

        this.actor.set_style_class_name('menu-category-button');
        this.actor.add_style_class_name('menu-text-item-button');
        this.actor.add_style_class_name('starkmenu-logout-button');
        this.actor.connect('leave-event', Lang.bind(this, this._onLeaveEvent));
        //this.removeActor(this.label);
        this.label.destroy();
        //this.removeActor(this._triangle);
        this._triangle.destroy();
        this._triangle = new St.Label();
        this.label_text = label;

        if(this.label_text == "") {
            this.label_text = "  "
            this.leftLabel = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.leftLabel.add_style_class_name('starkmenu-logout-button-label');
            this.addActor(this.leftLabel);
            //this.actor.style = "padding-top: 4px; padding-bottom: 4px;";
        }

        this.label_icon = new St.Icon({
            icon_name: this.icon,
            icon_size: 18,
            icon_type: St.IconType.FULLCOLOR,
        });

        this.label = new St.Label({
            text: this.label_text,
            style_class: 'menu-category-button-label'
        });
        this.label.add_style_class_name('starkmenu-logout-button-label');

        this.addActor(this.label_icon);
        this.labelIconAdded = true;
        this.addActor(this.label);
        this.labelAdded = true;
    },

    _update: function(quicklinkOptions, QuicklinksShutdownMenuOptions) {

        if (this.labelAdded) {
            this.removeActor(this.label);
            this.labelAdded = false;
        }
        if (this.labelIconAdded) {
            this.removeActor(this.label_icon);
            this.labelIconAdded = false;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'icons' || QuicklinksShutdownMenuOptions == "horizontal") {

            let iconSize = 18;
            if(quicklinkOptions == 'icons')
                iconSize = 26;
            else if(QuicklinksShutdownMenuOptions == "horizontal")
                iconSize = 22;
            else
                iconSize = 18;

            this.name_icon = new St.Icon({
                icon_name: this.icon,
                icon_size: iconSize,
                icon_type: St.IconType.FULLCOLOR,
            });

            let iconFileName = this.icon;
            let iconFile = Gio.file_new_for_path(iconFileName);
            let icon;

            if (iconFile.query_exists(null)) {
                icon = new Gio.FileIcon({
                    file: iconFile
                });
            } else {
                icon = new Gio.ThemedIcon({
                    name: this.icon
                });
            }

            this.label_icon.set_gicon(icon);
            this.label_icon.set_icon_size(iconSize);

            if (!iconFile.query_exists(null)) {
                this.label_icon = this.name_icon;

            }

            this.addActor(this.label_icon);
            this.labelIconAdded = true;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'labels') {
            this.label = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.label.add_style_class_name('starkmenu-logout-button-label');
            this.addActor(this.label);
            this.labelAdded = true;
        }
    },

    _onLeaveEvent: function() {
        this.hoverIcon.showUser = true;
        Tweener.addTween(this, {
            time: 1,
            onComplete: function() {
                if (!this.active) {
                    this.hoverIcon._onUserChanged();
                }
            }
        });
    },

    setActive: function(active) {
        if (active) {
            this.hoverIcon.showUser = false;
            this.actor.set_style_class_name('menu-category-button-selected');
            this.actor.add_style_class_name('starkmenu-logout-button-selected');
            if (this.parent.quicklinkOptions != 'icons') {
                this.hoverIcon._refresh(this.icon);
            }
        } else {
            this.actor.set_style_class_name('menu-category-button');
            this.actor.add_style_class_name('starkmenu-logout-button');
        }
    },

    _onButtonReleaseEvent: function(actor, event) {
        if (event.get_button() == 1) {
            this.activate(event);
        }
    },

    activate: function(event) {
        eval(this.func);
        this.parent.close();
    }
};

function LockScreenButton(label, icon, func, parent, hoverIcon) {
    this._init(label, icon, func, parent, hoverIcon);
}

LockScreenButton.prototype = {
    __proto__: AppPopupSubMenuMenuItem.prototype,

    _init: function(label, icon, func, parent, hoverIcon) {
        this.parent = parent;
        this.hoverIcon = hoverIcon;
        this.icon = icon;
        this.func = func;
        this.active = false;
        AppPopupSubMenuMenuItem.prototype._init.call(this, label);

        this.actor.set_style_class_name('menu-category-button');
        this.actor.add_style_class_name('menu-text-item-button');
        this.actor.add_style_class_name('starkmenu-lockscreen-button');
        this.actor.connect('leave-event', Lang.bind(this, this._onLeaveEvent));
        //this.removeActor(this.label);
        this.label.destroy();
        //this.removeActor(this._triangle);
        this._triangle.destroy();
        this._triangle = new St.Label();
        this.label_text = label;

        if(this.label_text == "") {
            this.label_text = "  "
            this.leftLabel = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.leftLabel.add_style_class_name('starkmenu-lockscreen-button-label');
            this.addActor(this.leftLabel);
            //this.actor.style = "padding-top: 4px; padding-bottom: 4px;";
        }

        this.label_icon = new St.Icon({
            icon_name: this.icon,
            icon_size: 18,
            icon_type: St.IconType.FULLCOLOR,
        });

        this.label = new St.Label({
            text: this.label_text,
            style_class: 'menu-category-button-label'
        });
        this.label.add_style_class_name('starkmenu-lockscreen-button-label');

        this.addActor(this.label_icon);
        this.labelIconAdded = true;
        this.addActor(this.label);
        this.labelAdded = true;
    },

    _update: function(quicklinkOptions, QuicklinksShutdownMenuOptions) {

        if (this.labelAdded) {
            this.removeActor(this.label);
            this.labelAdded = false;
        }
        if (this.labelIconAdded) {
            this.removeActor(this.label_icon);
            this.labelIconAdded = false;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'icons' || QuicklinksShutdownMenuOptions == "horizontal") {

            let iconSize = 18;
            if(quicklinkOptions == 'icons')
                iconSize = 26;
            else if(QuicklinksShutdownMenuOptions == "horizontal")
                iconSize = 22;
            else
                iconSize = 18;

            this.name_icon = new St.Icon({
                icon_name: this.icon,
                icon_size: iconSize,
                icon_type: St.IconType.FULLCOLOR,
            });

            let iconFileName = this.icon;
            let iconFile = Gio.file_new_for_path(iconFileName);
            let icon;

            if (iconFile.query_exists(null)) {
                icon = new Gio.FileIcon({
                    file: iconFile
                });
            } else {
                icon = new Gio.ThemedIcon({
                    name: this.icon
                });
            }

            this.label_icon.set_gicon(icon);
            this.label_icon.set_icon_size(iconSize);

            if (!iconFile.query_exists(null)) {
                this.label_icon = this.name_icon;

            }

            this.addActor(this.label_icon);
            this.labelIconAdded = true;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'labels') {
            this.label = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.label.add_style_class_name('starkmenu-lockscreen-button-label');
            this.addActor(this.label);
            this.labelAdded = true;
        }
    },

    _onLeaveEvent: function() {
        this.hoverIcon.showUser = true;
        Tweener.addTween(this, {
            time: 1,
            onComplete: function() {
                if (!this.active) {
                    this.hoverIcon._onUserChanged();
                }
            }
        });
    },

    setActive: function(active) {
        if (active) {
            this.hoverIcon.showUser = false;
            this.actor.set_style_class_name('menu-category-button-selected');
            this.actor.add_style_class_name('starkmenu-lockscreen-button-selected');
            if (this.parent.quicklinkOptions != 'icons') {
                this.hoverIcon._refresh(this.icon);
            }
        } else {
            this.actor.set_style_class_name('menu-category-button');
            this.actor.add_style_class_name('starkmenu-lockscreen-button');
        }
    },

    _onButtonReleaseEvent: function(actor, event) {
        if (event.get_button() == 1) {
            this.activate(event);
        }
    },

    activate: function(event) {
        eval(this.func);
        this.parent.close();
    }
};

function TextBoxItem(label, icon, func, parent, hoverIcon) {
    this._init(label, icon, func, parent, hoverIcon);
}

TextBoxItem.prototype = {
    __proto__: AppPopupSubMenuMenuItem.prototype,

    _init: function(label, icon, func, parent, hoverIcon) {
        this.parent = parent;
        this.hoverIcon = hoverIcon;
        this.icon = icon;
        this.func = func;
        this.active = false;
        AppPopupSubMenuMenuItem.prototype._init.call(this, label);

        this.actor.set_style_class_name('menu-category-button');
        this.actor.add_style_class_name('menu-text-item-button');
        this.actor.connect('leave-event', Lang.bind(this, this._onLeaveEvent));
        //this.removeActor(this.label);
        this.label.destroy();
        //this.removeActor(this._triangle);
        this._triangle.destroy();
        this._triangle = new St.Label();
        this.label_text = label;

        if(this.label_text == "") {
            this.label_text = "  "
            this.leftLabel = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.addActor(this.leftLabel);
            this.actor.style = "padding-top: 4px; padding-bottom: 4px;";
        }

        this.label_icon = new St.Icon({
            icon_name: this.icon,
            icon_size: 18,
            icon_type: St.IconType.FULLCOLOR,
        });

        this.label = new St.Label({
            text: this.label_text,
            style_class: 'menu-category-button-label'
        });

        this.addActor(this.label_icon);
        this.labelIconAdded = true;
        this.addActor(this.label);
        this.labelAdded = true;
    },

    _update: function(quicklinkOptions, QuicklinksShutdownMenuOptions) {

        if (this.labelAdded) {
            this.removeActor(this.label);
            this.labelAdded = false;
        }
        if (this.labelIconAdded) {
            this.removeActor(this.label_icon);
            this.labelIconAdded = false;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'icons' || QuicklinksShutdownMenuOptions == "horizontal") {

            let iconSize = 18;
            if(quicklinkOptions == 'icons')
                iconSize = 26;
            else if(QuicklinksShutdownMenuOptions == "horizontal")
                iconSize = 22;
            else
                iconSize = 18;

            this.name_icon = new St.Icon({
                icon_name: this.icon,
                icon_size: iconSize,
                icon_type: St.IconType.FULLCOLOR,
            });

            let iconFileName = this.icon;
            let iconFile = Gio.file_new_for_path(iconFileName);
            let icon;

            if (iconFile.query_exists(null)) {
                icon = new Gio.FileIcon({
                    file: iconFile
                });
            } else {
                icon = new Gio.ThemedIcon({
                    name: this.icon
                });
            }

            this.label_icon.set_gicon(icon);
            this.label_icon.set_icon_size(iconSize);

            if (!iconFile.query_exists(null)) {
                this.label_icon = this.name_icon;

            }

            this.addActor(this.label_icon);
            this.labelIconAdded = true;
        }

        if (quicklinkOptions == 'both' || quicklinkOptions == 'labels') {
            this.label = new St.Label({
                text: this.label_text,
                style_class: 'menu-category-button-label'
            });
            this.addActor(this.label);
            this.labelAdded = true;
        }
    },

    _onLeaveEvent: function() {
        this.hoverIcon.showUser = true;
        Tweener.addTween(this, {
            time: 1,
            onComplete: function() {
                if (!this.active) {
                    this.hoverIcon._onUserChanged();
                }
            }
        });
    },

    setActive: function(active) {
        if (active) {
            this.hoverIcon.showUser = false;
            this.actor.set_style_class_name('menu-category-button-selected');
            if (this.parent.quicklinkOptions != 'icons') {
                this.hoverIcon._refresh(this.icon);
            }
        } else this.actor.set_style_class_name('menu-category-button');
    },

    _onButtonReleaseEvent: function(actor, event) {
        if (event.get_button() == 1) {
            this.activate(event);
        }
    },

    activate: function(event) {
        eval(this.func);
        this.parent.close();
    }
};

function AllProgramsItem(label, icon, parent) {
    this._init(label, icon, parent);
}

AllProgramsItem.prototype = {
    __proto__: AppPopupSubMenuMenuItem.prototype,

    _init: function(label, icon, parent) {
        AppPopupSubMenuMenuItem.prototype._init.call(this, label);

        this.actor.set_style_class_name('');
        this.box = new St.BoxLayout({
            style_class: 'menu-category-button'
        });
        this.parent = parent;
        //this.removeActor(this.label);
        this.label.destroy();
        //this.removeActor(this._triangle);
        this._triangle.destroy();
        this._triangle = new St.Label();
        this.label = new St.Label({
            text: " " + label,
            style: "padding-left: 20px"
        });
        this.icon = new St.Icon({
            style_class: 'popup-menu-icon',
            icon_type: St.IconType.FULLCOLOR,
            icon_name: icon,
            icon_size: ICON_SIZE
        });
        this.box.add_actor(this.icon);
        this.box.add_actor(this.label);
        this.addActor(this.box);
    },

    setActive: function(active) {
        if (active) this.box.set_style_class_name('menu-category-button-selected');
        else this.box.set_style_class_name('menu-category-button');
    },

    _onButtonReleaseEvent: function(actor, event) {
        if (event.get_button() == 1) {
            this.activate(event);
        }
    },

    activate: function(event) {
        if (this.parent.leftPane.get_child() == this.parent.favsBox) this.parent.switchPanes("apps");
        else this.parent.switchPanes("favs");
    }
};

function HoverIcon(parent) {
    this._init(parent);
}

HoverIcon.prototype = {
    _init: function(parent) {
        this.actor = new St.Bin();
        this.icon = new St.Icon({
            icon_size: HOVER_ICON_SIZE,
            icon_type: St.IconType.FULLCOLOR,
            style_class: 'hover-icon'
        });
        this.actor.cild = this.icon;

        this.showUser = true;

        this.userBox = new St.BoxLayout({
            style_class: 'hover-box',
            reactive: true,
            vertical: false
        });
        this.userBox.add_style_class_name("starkhover-box");

        this._userIcon = new St.Icon({
            style_class: 'hover-user-icon'
        });

        this.userBox.connect('button-press-event', Lang.bind(this, function() {
            parent.toggle();
            Util.spawnCommandLine("cinnamon-settings user");
        }));

        this._userIcon.hide();
        this.userBox.add(this.icon, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.START
        });
        this.userBox.add(this._userIcon, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.START
        });

        this.userLabelColor = new St.BoxLayout(({
            style_class: 'menu-background'
        }));

        this.userLabel = new St.Label();
        this.userLabel.set_style("font-size: 16px;");
        this.userLabel.add_style_class_name("starkmenu-user-label");

        this.userBox.add(this.userLabel, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.MIDDLE
        });

        var icon = new Gio.ThemedIcon({
            name: 'avatar-default'
        });
        this._userIcon.set_gicon(icon);
        this._userIcon.show();

        this._user = AccountsService.UserManager.get_default().get_user(GLib.get_user_name());
        this._userLoadedId = this._user.connect('notify::is_loaded', Lang.bind(this, this._onUserChanged));
        this._userChangedId = this._user.connect('changed', Lang.bind(this, this._onUserChanged));
        this._onUserChanged();

        //this._refresh('folder-home');
    },

    _onUserChanged: function() {
        if (this._user.is_loaded && this.showUser) {
            //this.set_applet_tooltip(this._user.get_real_name());
            this.userLabel.set_text(this._user.get_real_name());
            if (this._userIcon) {
                let iconFileName = this._user.get_icon_file();
                let iconFile = Gio.file_new_for_path(iconFileName);
                let icon;
                if (iconFile.query_exists(null)) {
                    icon = new Gio.FileIcon({
                        file: iconFile
                    });
                } else {
                    icon = new Gio.ThemedIcon({
                        name: 'avatar-default'
                    });
                }
                this._userIcon.set_gicon(icon);
                this.icon.hide();
                this._userIcon.show();
            }
        }
    },

    _refresh: function(icon) {
        this._userIcon.hide();

        let iconFileName = icon;
        let iconFile = Gio.file_new_for_path(iconFileName);
        let newicon;

        if (iconFile.query_exists(null)) {
            newicon = new Gio.FileIcon({
                file: iconFile
            });
        } else {
            newicon = new Gio.ThemedIcon({
                name: icon
            });
        }

        if (iconFile.query_exists(null)) {
            this.icon.set_gicon(newicon);
        }
        else {
            this.icon.set_icon_name(icon);
        }

        this.icon.show();
    }
};

function ShutdownContextMenuItem(parentMenu, menu, label, action) {
    this._init(parentMenu, menu, label, action);
}

ShutdownContextMenuItem.prototype = {
    __proto__: ApplicationContextMenuItem.prototype,

    _init: function(parentMenu, menu, label, action) {
        this.parentMenu = parentMenu;
        ApplicationContextMenuItem.prototype._init.call(this, menu, label, action);
        this._screenSaverProxy = new ScreenSaver.ScreenSaverProxy();
    },

    activate: function(event) {
        switch (this._action) {
        case "logout":
            Session.LogoutRemote(0);
            break;
        case "lock":
            let screensaver_settings = new Gio.Settings({
                schema: "org.cinnamon.desktop.screensaver"
            });
            let screensaver_dialog = Gio.file_new_for_path("/usr/bin/cinnamon-screensaver-command");
            if (screensaver_dialog.query_exists(null)) {
                if (screensaver_settings.get_boolean("ask-for-away-message")) {
                    Util.spawnCommandLine("cinnamon-screensaver-lock-dialog");
                }
                else {
                    Util.spawnCommandLine("cinnamon-screensaver-command --lock");
                }
            }
            else {
                this._screenSaverProxy.LockRemote("");
            }
            break;
        }
        this._appButton.toggle();
        this.parentMenu.toggle();
        return false;
    }

};

function ShutdownMenu(parent, hoverIcon) {
    this._init(parent, hoverIcon);
}

ShutdownMenu.prototype = {
    __proto__: AppPopupSubMenuMenuItem.prototype,

    _init: function(parent, hoverIcon) {
        let label = '';
        this.hoverIcon = hoverIcon;
        this.parent = parent;
        AppPopupSubMenuMenuItem.prototype._init.call(this, label);
        this.actor.set_style_class_name('menu-category-button');
        //this.removeActor(this.label);
        this.label.destroy();
        //this.removeActor(this._triangle);
        this._triangle.destroy();
        this._triangle = new St.Label();
        this.icon = new St.Icon({
            style_class: 'popup-menu-icon',
            icon_type: St.IconType.FULLCOLOR,
            icon_name: 'forward',
            icon_size: ICON_SIZE
        });
        this.addActor(this.icon);

        this.menu = new PopupMenu.PopupSubMenu(this.actor);
        this.menu.actor.remove_style_class_name("popup-sub-menu");

        let menuItem;
        menuItem = new ShutdownContextMenuItem(this.parent, this.menu, _("Logout"), "logout");
        this.menu.addMenuItem(menuItem);
        menuItem = new ShutdownContextMenuItem(this.parent, this.menu, _("Lock Screen"), "lock");
        this.menu.addMenuItem(menuItem);

    },

    setActive: function(active) {
        if (active) {
            this.actor.set_style_class_name('menu-category-button-selected');
            this.hoverIcon._refresh('system-log-out');
        } else this.actor.set_style_class_name('menu-category-button');
    },

    _onButtonReleaseEvent: function(actor, event) {
        if (event.get_button() == 1) {
            this.menu.toggle();
        }

    }
};

function CategoriesApplicationsBox() {
    this._init();
}

CategoriesApplicationsBox.prototype = {
    _init: function() {
        this.actor = new St.BoxLayout();
        this.actor._delegate = this;
    },

    acceptDrop : function(source, actor, x, y, time) {
        if (source instanceof FavoritesButton){
            source.actor.destroy();
            actor.destroy();
            AppFavorites.getAppFavorites().removeFavorite(source.app.get_id());
            return true;
        }
        return false;
    }
};

function RightButtonsBox(appsMenuButton, menu) {
    this._init(appsMenuButton, menu);
}

RightButtonsBox.prototype = {
    _init: function(appsMenuButton, menu) {
        this.appsMenuButton = appsMenuButton;
        this.actor = new St.BoxLayout({ vertical: true });
        this.itemsBox = new St.BoxLayout({ vertical: true });

        this.actor._delegate = this;
        this.menu = menu;
        this.addItems();

        this.actor.add_actor(this.itemsBox);
        this.addShutdownBoxes();
    },

    acceptDrop: function(source, actor, x, y, time) {
        if (source instanceof FavoritesButton) {
            source.actor.destroy();
            actor.destroy();
            AppFavorites.getAppFavorites().removeFavorite(source.app.get_id());
            return true;
        }
        return false;
    },

    _update_quicklinks: function(quicklinkOptions, showUserIconLabel, QuicklinksShutdownMenuOptions) {

        for (let i in this.quicklinks) {
            this.quicklinks[i]._update(quicklinkOptions);
        }

        this.shutdown._update(quicklinkOptions, QuicklinksShutdownMenuOptions);
        this.shutdown2._update(quicklinkOptions, QuicklinksShutdownMenuOptions);
        this.shutdown3._update(quicklinkOptions, QuicklinksShutdownMenuOptions);
        this.logout._update(quicklinkOptions, QuicklinksShutdownMenuOptions);
        this.logout2._update(quicklinkOptions, QuicklinksShutdownMenuOptions);
        this.lock._update(quicklinkOptions, QuicklinksShutdownMenuOptions);
        this.lock2._update(quicklinkOptions, QuicklinksShutdownMenuOptions);

        if (quicklinkOptions == 'icons') {
            this.hoverIcon.userLabel.hide();
            this.hoverIcon._userIcon.set_icon_size(22);
            this.hoverIcon.icon.set_icon_size(22);
            this.shutDownMenuBox.set_style('min-height: 1px');
            this.shutdownMenu.actor.hide();

        }
        else {
            if(showUserIconLabel) {
                this.hoverIcon.userLabel.show();
            } else {
                this.hoverIcon.userLabel.hide();
                let centerWidth = (this.actor.get_width() - (HOVER_ICON_SIZE + 4)) / 2;
                this.hoverIcon.userBox.style = "padding-left:"+ centerWidth +"px; padding-right:"+ centerWidth +"px;";
            }

            this.hoverIcon._userIcon.set_icon_size(HOVER_ICON_SIZE);
            this.hoverIcon.icon.set_icon_size(HOVER_ICON_SIZE);
            this.shutDownIconBox.hide();
            this.shutdownMenu.actor.show();
            this.shutDownMenuBox.set_style('min-height: 80px');
        }
    },

    addItems: function() {
        this.itemsBox.destroy_all_children();

        this.hoverIcon = new HoverIcon(this.menu);
        this.itemsBox.add_actor(this.hoverIcon.userBox);

        this.quicklinks = [];
        for (let i in this.menu.quicklinks) {
            if (this.menu.quicklinks[i] != '') {
                if (this.menu.quicklinks[i] == 'separator') {
                    this.separator = new PopupMenu.PopupSeparatorMenuItem();

                    if (this.menu.quicklinkOptions == 'labels') {
                        this.separator.actor.set_style("padding: 0em 1.0em; min-width: 1px;");
                    } else if (this.menu.quicklinkOptions == 'both') {
                        this.separator.actor.set_style("padding: 0em 2.25em; min-width: 1px;");
                    } else {
                        this.separator.actor.set_style("padding: 0em 1em; min-width: 1px;");
                    }

                    this.itemsBox.add_actor(this.separator.actor);
                }
                else {
                    let split = this.menu.quicklinks[i].split(',');
                    if (split.length == 3) {
                        this.quicklinks[i] = new TextBoxItem(_(split[0]), _(split[1]), "Util.spawnCommandLine('" + _(split[2]) + "')", this.menu, this.hoverIcon, false);
                        this.itemsBox.add_actor(this.quicklinks[i].actor);
                    }
                }
            }
        }
    },

    addShutdownBoxes: function() {
        this.shutDownMenuBox = new St.BoxLayout({ style_class: 'hover-box', vertical: true });
        this.shutDownMenuBox.add_style_class_name("starkhover-box");

        this.shutDownIconBox = new St.BoxLayout({ vertical: true });
        this.shutDownIconBoxXP = new St.BoxLayout({ vertical: false });
        this.shutdownBox = new St.BoxLayout({ vertical: false });


        this.actor.add(new St.Bin(), { expand: true });

        this.actor.add_actor(this.shutDownMenuBox);
        this.actor.add_actor(this.shutDownIconBox);
        this.actor.add_actor(this.shutDownIconBoxXP);


        this.shutdown = new QuitButton(_("Quit"), "system-shutdown", "Session.ShutdownRemote()", this.menu, this.hoverIcon, false);
        this.shutdown2 = new QuitButton(_("Quit"), "system-shutdown", "Session.ShutdownRemote()", this.menu, this.hoverIcon, false);
        this.shutdown3 = new QuitButton("", "system-shutdown", "Session.ShutdownRemote()", this.menu, this.hoverIcon, false);
        this.logout = new LogoutButton(_("Logout"), "system-log-out", "Session.LogoutRemote(0)", this.menu, this.hoverIcon, false);
        this.logout2 = new LogoutButton("", "system-log-out", "Session.LogoutRemote(0)", this.menu, this.hoverIcon, false);

        let screensaver_settings = new Gio.Settings({
            schema: "org.cinnamon.desktop.screensaver"
        });
        let screensaver_dialog = Gio.file_new_for_path("/usr/bin/cinnamon-screensaver-command");
        if (screensaver_dialog.query_exists(null)) {
            if (screensaver_settings.get_boolean("ask-for-away-message")) {
                this.lock = new LockScreenButton(_("Lock screen"), "system-lock-screen", "Util.spawnCommandLine('cinnamon-screensaver-lock-dialog')", this.menu, this.hoverIcon, false);
                this.lock2 = new LockScreenButton("", "system-lock-screen", "Util.spawnCommandLine('cinnamon-screensaver-lock-dialog')", this.menu, this.hoverIcon, false);
            }
            else {
                this.lock = new LockScreenButton(_("Lock screen"), "system-lock-screen", "Util.spawnCommandLine('cinnamon-screensaver-command --lock')", this.menu, this.hoverIcon, false);
                this.lock2 = new LockScreenButton("", "system-lock-screen", "Util.spawnCommandLine('cinnamon-screensaver-command --lock')", this.menu, this.hoverIcon, false);
            }
        }

        this.shutdownMenu = new ShutdownMenu(this.menu, this.hoverIcon);

        this.shutdownBox.add_actor(this.shutdown.actor);
        this.shutdownBox.add_actor(this.shutdownMenu.actor);

        this.shutDownMenuBox.add(this.shutdownBox);
        this.shutDownMenuBox.add_actor(this.shutdownMenu.menu.actor);

        this.shutDownIconBox.add_actor(this.shutdown2.actor);
        this.shutDownIconBox.add_actor(this.logout.actor);
        this.shutDownIconBox.add_actor(this.lock.actor);

        this.shutDownIconBoxXP.add_actor(this.shutdown3.actor);
        this.shutDownIconBoxXP.add_actor(this.logout2.actor);
        this.shutDownIconBoxXP.add_actor(this.lock2.actor);
    },

    _getPreferredHeight: function(actor, forWidth, alloc) {
        let[minSize, naturalSize] = this.itemsBox.get_preferred_height(forWidth);
        alloc.min_size = minSize;
        alloc.natural_size = naturalSize;
    },

    _getPreferredWidth: function(actor, forHeight, alloc) {
        let[minSize, naturalSize] = this.itemsBox.get_preferred_width(forHeight);
        alloc.min_size = minSize;
        alloc.natural_size = naturalSize;
    },

    _allocate: function(actor, box, flags) {
        let childBox = new Clutter.ActorBox();

        let[minWidth, minHeight, naturalWidth, naturalHeight] = this.itemsBox.get_preferred_size();

        childBox.y1 = 0;
        childBox.y2 = childBox.y1 + naturalHeight;
        childBox.x1 = 0;
        childBox.x2 = childBox.x1 + naturalWidth;
        this.itemsBox.allocate(childBox, flags);

        let mainBoxHeight = this.appsMenuButton.mainBox.get_height();

        // [minWidth, minHeight, naturalWidth, naturalHeight] = this.shutDownItemsBox.get_preferred_size();
        // childBox.y1 = mainBoxHeight - 110;
        // childBox.y2 = childBox.y1;
        // childBox.x1 = 0;
        // childBox.x2 = childBox.x1 + naturalWidth;
        // this.shutDownItemsBox.allocate(childBox, flags);
    }
};

function FavoritesBox() {
    this._init();
}

FavoritesBox.prototype = {
    _init: function() {
        this.actor = new St.BoxLayout({ vertical: true });
        this.actor._delegate = this;

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;
    },

    _clearDragPlaceholder: function() {
        if (this._dragPlaceholder) {
            this._dragPlaceholder.animateOutAndDestroy();
            this._dragPlaceholder = null;
            this._dragPlaceholderPos = -1;
        }
    },

    handleDragOver : function(source, actor, x, y, time) {
        let app = source.app;

        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

        let children = this.actor.get_children();
        let numChildren = children.length;
        let boxHeight = this.actor.height;

        // Keep the placeholder out of the index calculation; assuming that
        // the remove target has the same size as "normal" items, we don't
        // need to do the same adjustment there.
        if (this._dragPlaceholder) {
            boxHeight -= this._dragPlaceholder.actor.height;
            numChildren--;
        }

        let pos = Math.round(y * numChildren / boxHeight);

        if (pos != this._dragPlaceholderPos && pos <= numChildren) {
            if (this._animatingPlaceholdersCount > 0) {
                let appChildren = children.filter(function(actor) {
                    return (actor._delegate instanceof FavoritesButton);
                });
                this._dragPlaceholderPos = children.indexOf(appChildren[pos]);
            } else {
                this._dragPlaceholderPos = pos;
            }

            /* // Don't allow positioning before or after self
            if (favPos != -1 && (pos == favPos || pos == favPos + 1)) {
                if (this._dragPlaceholder) {
                    this._dragPlaceholder.animateOutAndDestroy();
                    this._animatingPlaceholdersCount++;
                    this._dragPlaceholder.actor.connect('destroy',
                        Lang.bind(this, function() {
                            this._animatingPlaceholdersCount--;
                        }));
                }
                this._dragPlaceholder = null;

                return DND.DragMotionResult.CONTINUE;
            } */

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.actor.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new DND.GenericDragPlaceholderItem();
            this._dragPlaceholder.child.set_width (source.actor.height);
            this._dragPlaceholder.child.set_height (source.actor.height);
            this.actor.insert_actor(this._dragPlaceholder.actor,
                                             this._dragPlaceholderPos);
            if (fadeIn)
                this._dragPlaceholder.animateIn();
        }

        return DND.DragMotionResult.MOVE_DROP;
    },

    // Draggable target interface
    acceptDrop : function(source, actor, x, y, time) {
        let app = source.app;

        let id = app.get_id();

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let srcIsFavorite = (id in favorites);

        let favPos = 0;
        let children = this.actor.get_children();
        for (let i = 0; i < this._dragPlaceholderPos; i++) {
            if (this._dragPlaceholder &&
                children[i] == this._dragPlaceholder.actor)
                continue;

            if (!(children[i]._delegate instanceof FavoritesButton)) continue;

            let childId = children[i]._delegate.app.get_id();
            if (childId == id)
                continue;
            if (childId in favorites)
                favPos++;
        }

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                let appFavorites = AppFavorites.getAppFavorites();
                if (srcIsFavorite)
                    appFavorites.moveFavoriteToPos(id, favPos);
                else
                    appFavorites.addFavoriteAtPos(id, favPos);
                return false;
            }));

        return true;
    }
}

//----------------------------------------------------------------
//
// l10n
//
//----------------------------------------------------------------------

const Gettext = imports.gettext
Gettext.bindtextdomain("CinnXPStarkMenu@NikoKrause", GLib.get_home_dir() + "/.local/share/locale")

function _(str) {
  return Gettext.dgettext("CinnXPStarkMenu@NikoKrause", str)
}

//----------------------------------------------------------------------
//
// MyApplet
//
//----------------------------------------------------------------------

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.initial_load_done = false;

        this.set_applet_tooltip(_("Menu"));
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this.orientation = orientation;

        this.actor.connect('key-press-event', Lang.bind(this, this._onSourceKeyPress));

        this.settings = new Settings.AppletSettings(this, "CinnXPStarkMenu@NikoKrause", instance_id);

        this.settings.bindProperty(Settings.BindingDirection.IN, "show-places", "showPlaces", this._refreshBelowApps, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "activate-on-hover", "activateOnHover", this._updateActivateOnHover, null);
        this._updateActivateOnHover();

        this.menu.actor.add_style_class_name('menu-background');
        this.menu.actor.add_style_class_name("starkmenu-background");
        this.menu.connect('open-state-changed', Lang.bind(this, this._onOpenStateChanged));

        this.settings.bindProperty(Settings.BindingDirection.IN, "menu-layout", "menuLayout", this._updateMenuLayout, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "menu-icon-custom", "menuIconCustom", this._updateIconAndLabel, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "menu-icon", "menuIcon", this._updateIconAndLabel, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "menu-label", "menuLabel", this._updateIconAndLabel, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "overlay-key", "overlayKey", this._updateKeybinding, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-category-icons", "showCategoryIcons", this._refreshAll, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-application-icons", "showApplicationIcons", this._refreshAll, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-animation", "enableAnimation", null, null);


        this._updateKeybinding();

        this.settings.bindProperty(Settings.BindingDirection.IN, "all-programs-label", "allProgramsLabel", this._updateCustomLabels, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "favorites-label", "favoritesLabel", this._updateCustomLabels, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "shutdown-label", "shutdownLabel", this._updateCustomLabels, null);

        Main.themeManager.connect("theme-set", Lang.bind(this, this._updateIconAndLabel));
        this._updateIconAndLabel();

        this._searchInactiveIcon = new St.Icon({ style_class: 'menu-search-entry-icon',
            icon_name: 'edit-find',
            icon_type: St.IconType.SYMBOLIC });
        this._searchActiveIcon = new St.Icon({ style_class: 'menu-search-entry-icon',
            icon_name: 'edit-clear',
            icon_type: St.IconType.SYMBOLIC });
        this._searchIconClickedId = 0;
        this._applicationsButtons = new Array();
        this._applicationsButtonFromApp = new Object();
        this._favoritesButtons = new Array();
        this._placesButtons = new Array();
        this._transientButtons = new Array();
        this._recentButtons = new Array();
        this._categoryButtons = new Array();
        this._searchProviderButtons = new Array();
        this._selectedItemIndex = null;
        this._previousSelectedActor = null;
        this._previousVisibleIndex = null;
        this._previousTreeSelectedActor = null;
        this._activeContainer = null;
        this._activeActor = null;
        this._applicationsBoxWidth = 0;
        this.menuIsOpening = false;
        this._knownApps = new Array(); // Used to keep track of apps that are already installed, so we can highlight newly installed ones
        this._appsWereRefreshed = false;
        this._canUninstallApps = GLib.file_test("/usr/bin/cinnamon-remove-application", GLib.FileTest.EXISTS);
        this._isBumblebeeInstalled = GLib.file_test("/usr/bin/optirun", GLib.FileTest.EXISTS);
        this.RecentManager = new DocInfo.DocManager();
        this.privacy_settings = new Gio.Settings( {schema_id: PRIVACY_SCHEMA} );
        this.noRecentDocuments = true;
        this._activeContextMenuParent = null;
        this._activeContextMenuItem = null;
        this._display();
        this._updateMenuLayout();
        this._updateCustomLabels();
        appsys.connect('installed-changed', Lang.bind(this, this._refreshAll));
        AppFavorites.getAppFavorites().connect('changed', Lang.bind(this, this._refreshFavs));
        this.settings.bindProperty(Settings.BindingDirection.IN, "hover-delay", "hover_delay_ms", this._update_hover_delay, null);
        this._update_hover_delay();
        Main.placesManager.connect('places-updated', Lang.bind(this, this._refreshBelowApps));
        this.RecentManager.connect('changed', Lang.bind(this, this._refreshRecent));
        this.privacy_settings.connect("changed::" + REMEMBER_RECENT_KEY, Lang.bind(this, this._refreshRecent));

        this.settings.bindProperty(Settings.BindingDirection.IN, "show-quicklinks", "showQuicklinks", this._updateQuickLinksView, null);
        this._updateQuickLinksView();

        this.settings.bindProperty(Settings.BindingDirection.IN, "show-quicklinks-shutdown-menu", "showQuicklinksShutdownMenu", this._updateQuickLinksShutdownView, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklinks-shutdown-menu-options", "QuicklinksShutdownMenuOptions", this._updateQuickLinks, null);
        this._updateQuickLinksShutdownView();

        this._fileFolderAccessActive = false;
        this._pathCompleter = new Gio.FilenameCompleter();
        this._pathCompleter.set_dirs_only(false);
        this.lastAcResults = new Array();
        this.settings.bindProperty(Settings.BindingDirection.IN, "search-filesystem", "searchFilesystem", null, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-0-checkbox", "quicklink_0_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-1-checkbox", "quicklink_1_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-2-checkbox", "quicklink_2_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-3-checkbox", "quicklink_3_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-4-checkbox", "quicklink_4_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-5-checkbox", "quicklink_5_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-6-checkbox", "quicklink_6_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-7-checkbox", "quicklink_7_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-8-checkbox", "quicklink_8_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-9-checkbox", "quicklink_9_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-10-checkbox", "quicklink_10_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-11-checkbox", "quicklink_11_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-12-checkbox", "quicklink_12_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-13-checkbox", "quicklink_13_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-14-checkbox", "quicklink_14_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-15-checkbox", "quicklink_15_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-16-checkbox", "quicklink_16_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-17-checkbox", "quicklink_17_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-18-checkbox", "quicklink_18_checkbox", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-19-checkbox", "quicklink_19_checkbox", this._updateQuickLinks, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-0", "quicklink_0", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-1", "quicklink_1", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-2", "quicklink_2", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-3", "quicklink_3", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-4", "quicklink_4", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-5", "quicklink_5", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-6", "quicklink_6", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-7", "quicklink_7", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-8", "quicklink_8", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-9", "quicklink_9", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-10", "quicklink_10", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-11", "quicklink_11", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-12", "quicklink_12", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-13", "quicklink_13", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-14", "quicklink_14", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-15", "quicklink_15", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-16", "quicklink_16", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-17", "quicklink_17", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-18", "quicklink_18", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-19", "quicklink_19", this._updateQuickLinks, null);

        this.settings.bindProperty(Settings.BindingDirection.IN, "quicklink-options", "quicklinkOptions", this._updateQuickLinks, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-user-icon-label", "showUserIconLabel", this._updateQuickLinks, null);
        this._updateQuickLinks();

        // We shouldn't need to call refreshAll() here... since we get a "icon-theme-changed" signal when CSD starts.
        // The reason we do is in case the Cinnamon icon theme is the same as the one specificed in GTK itself (in .config)
        // In that particular case we get no signal at all.
        this._refreshAll();

        St.TextureCache.get_default().connect("icon-theme-changed", Lang.bind(this, this.onIconThemeChanged));
    },

    _updateKeybinding: function() {
        Main.keybindingManager.addHotKey("overlay-key", this.overlayKey, Lang.bind(this, function() {
            if (!Main.overview.visible && !Main.expo.visible)
                this.menu.toggle_with_options(this.enableAnimation);
        }));
    },

    onIconThemeChanged: function() {
        this._refreshAll();
    },

    _refreshAll: function() {
        this._refreshApps();
        this._refreshFavs();
        this._refreshPlaces();
        this._refreshRecent();
    },

    _refreshBelowApps: function() {
        this._refreshPlaces();
        this._refreshRecent();
    },

    openMenu: function() {
        if (!this._applet_context_menu.isOpen) {
            this.menu.open(this.enableAnimation);
        }
    },

    _updateActivateOnHover: function() {
        if (this._openMenuId) {
            this.actor.disconnect(this._openMenuId);
            this._openMenuId = 0;
        }
        if (this.activateOnHover) {
            this._openMenuId = this.actor.connect('enter-event', Lang.bind(this, this.openMenu));
        }
    },

    _update_hover_delay: function() {
        this.hover_delay = this.hover_delay_ms / 1000
    },

    _appletStyles: function(pane) {
        let favsWidth = 0.95 * (this.favsBox.get_allocation_box().x2 - this.favsBox.get_allocation_box().x1);
        //let scrollWidth = this.searchBox.get_width() + this.rightButtonsBox.actor.get_width();
        this.searchEntry.style = "width:" + favsWidth + "px; padding-left: 6px; padding-right: 6px;";
        this.appsButton.box.style = "width:" + favsWidth + "px";
        let scrollBoxHeight = (this.favsBox.get_allocation_box().y2 - this.favsBox.get_allocation_box().y1) + this.separator.actor.get_height() - (this.applicationsScrollBox.get_theme_node().get_border_width(St.Side.TOP) + this.applicationsScrollBox.get_theme_node().get_border_width(St.Side.BOTTOM));
        this.applicationsScrollBox.style = "width: 26.5em;height: " + scrollBoxHeight + "px;";
        this.categoriesScrollBox.style = "height: " + scrollBoxHeight + "px;";
    },

    _updateQuickLinksView: function() {
        this.menu.showQuicklinks = this.showQuicklinks;
        if (this.menu.showQuicklinks) {
            this.rightButtonsBox.actor.show();
        }
        else {
            this.rightButtonsBox.actor.hide();
        }
    },

    _updateQuickLinksShutdownView: function() {
        this.menu.showQuicklinksShutdownMenu = this.showQuicklinksShutdownMenu;
        this.menu.QuicklinksShutdownMenuOptions = this.QuicklinksShutdownMenuOptions;
        if (this.menu.showQuicklinksShutdownMenu) {
            if (this.quicklinkOptions != 'icons') {
                if (this.QuicklinksShutdownMenuOptions == 'dropdown') {
                    this.rightButtonsBox.shutdown.actor.show();
                    this.rightButtonsBox.shutdownMenu.actor.show();
                    this.rightButtonsBox.shutDownIconBox.hide();
                    this.rightButtonsBox.shutDownIconBoxXP.hide();
                    this.rightButtonsBox.shutDownMenuBox.show();
                    this.rightButtonsBox.shutDownMenuBox.set_style('min-height: 80px');
                } else if (this.QuicklinksShutdownMenuOptions == 'vertical') {
                    this.rightButtonsBox.shutdown.actor.hide();
                    this.rightButtonsBox.shutdownMenu.actor.hide();
                    this.rightButtonsBox.shutDownIconBox.show();
                    this.rightButtonsBox.shutDownIconBoxXP.hide();
                    this.rightButtonsBox.shutDownMenuBox.hide();
                } else {
                    this.rightButtonsBox.shutdown.actor.hide();
                    this.rightButtonsBox.shutdownMenu.actor.hide();
                    this.rightButtonsBox.shutDownIconBox.hide();
                    this.rightButtonsBox.shutDownIconBoxXP.show();
                    this.rightButtonsBox.shutDownMenuBox.hide();
                }
            }
            else {
                this.rightButtonsBox.shutdown.actor.hide();
                this.rightButtonsBox.shutdownMenu.actor.hide();
                this.rightButtonsBox.shutDownMenuBox.hide();
                this.rightButtonsBox.shutDownIconBoxXP.hide();
                this.rightButtonsBox.shutDownIconBox.show();
            }
        }
        else {
            this.rightButtonsBox.shutdown.actor.hide();
            this.rightButtonsBox.shutdownMenu.actor.hide();
            this.rightButtonsBox.shutDownIconBoxXP.hide();
            this.rightButtonsBox.shutDownIconBox.hide();
            this.rightButtonsBox.shutDownMenuBox.hide();
        }

        if (this.rightButtonsBox.actor.get_height() > 415) {
            this.favsBox.style = "min-height: " + (this.rightButtonsBox.actor.get_height() - (this.leftPaneBox.get_theme_node().get_padding(St.Side.TOP) + this.leftPaneBox.get_theme_node().get_padding(St.Side.BOTTOM) + this.searchBox.get_height() + this.appsButton.box.get_height() + this.separator.actor.get_height())+1) + "px;min-width: 235px;";
        }

    },

    _updateQuickLinks: function() {

        this.menu.quicklinksCheckboxes = [];
        this.menu.quicklinksCheckboxes[0] = this.quicklink_0_checkbox;
        this.menu.quicklinksCheckboxes[1] = this.quicklink_1_checkbox;
        this.menu.quicklinksCheckboxes[2] = this.quicklink_2_checkbox;
        this.menu.quicklinksCheckboxes[3] = this.quicklink_3_checkbox;
        this.menu.quicklinksCheckboxes[4] = this.quicklink_4_checkbox;
        this.menu.quicklinksCheckboxes[5] = this.quicklink_5_checkbox;
        this.menu.quicklinksCheckboxes[6] = this.quicklink_6_checkbox;
        this.menu.quicklinksCheckboxes[7] = this.quicklink_7_checkbox;
        this.menu.quicklinksCheckboxes[8] = this.quicklink_8_checkbox;
        this.menu.quicklinksCheckboxes[9] = this.quicklink_9_checkbox;
        this.menu.quicklinksCheckboxes[10] = this.quicklink_10_checkbox;
        this.menu.quicklinksCheckboxes[11] = this.quicklink_11_checkbox;
        this.menu.quicklinksCheckboxes[12] = this.quicklink_12_checkbox;
        this.menu.quicklinksCheckboxes[13] = this.quicklink_13_checkbox;
        this.menu.quicklinksCheckboxes[14] = this.quicklink_14_checkbox;
        this.menu.quicklinksCheckboxes[15] = this.quicklink_15_checkbox;
        this.menu.quicklinksCheckboxes[16] = this.quicklink_16_checkbox;
        this.menu.quicklinksCheckboxes[17] = this.quicklink_17_checkbox;
        this.menu.quicklinksCheckboxes[18] = this.quicklink_18_checkbox;
        this.menu.quicklinksCheckboxes[19] = this.quicklink_19_checkbox;

        this.menu.quicklinks = [];
        this.menu.quicklinks[0] = this.quicklink_0;
        this.menu.quicklinks[1] = this.quicklink_1;
        this.menu.quicklinks[2] = this.quicklink_2;
        this.menu.quicklinks[3] = this.quicklink_3;
        this.menu.quicklinks[4] = this.quicklink_4;
        this.menu.quicklinks[5] = this.quicklink_5;
        this.menu.quicklinks[6] = this.quicklink_6;
        this.menu.quicklinks[7] = this.quicklink_7;
        this.menu.quicklinks[8] = this.quicklink_8;
        this.menu.quicklinks[9] = this.quicklink_9;
        this.menu.quicklinks[10] = this.quicklink_10;
        this.menu.quicklinks[11] = this.quicklink_11;
        this.menu.quicklinks[12] = this.quicklink_12;
        this.menu.quicklinks[13] = this.quicklink_13;
        this.menu.quicklinks[14] = this.quicklink_14;
        this.menu.quicklinks[15] = this.quicklink_15;
        this.menu.quicklinks[16] = this.quicklink_16;
        this.menu.quicklinks[17] = this.quicklink_17;
        this.menu.quicklinks[18] = this.quicklink_18;
        this.menu.quicklinks[19] = this.quicklink_19;

        /* remove quicklink if checkbox "Show Quicklink" is false */
        for (let i in this.menu.quicklinksCheckboxes) {
            if (!this.menu.quicklinksCheckboxes[i]) {
                this.menu.quicklinks[i] = "";
            }
        }

        this.menu.quicklinkOptions = this.quicklinkOptions;
        this.rightButtonsBox.addItems();
        this.rightButtonsBox._update_quicklinks(this.quicklinkOptions, this.showUserIconLabel, this.QuicklinksShutdownMenuOptions);

        this._updateQuickLinksShutdownView();

        if (this.rightButtonsBox.actor.get_height() > 415) {
            this.favsBox.style = "min-height: " + (this.rightButtonsBox.actor.get_height() - (this.leftPaneBox.get_theme_node().get_padding(St.Side.TOP) + this.leftPaneBox.get_theme_node().get_padding(St.Side.BOTTOM) + this.searchBox.get_height() + this.appsButton.box.get_height() + this.separator.actor.get_height())+1) + "px;min-width: 235px;";
        }

    },

    on_orientation_changed: function (orientation) {
        this.orientation = orientation;
        this.menu.destroy();
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this.menu.actor.add_style_class_name('menu-background');
        this.menu.actor.add_style_class_name("starkmenu-background");

        this.menu.connect('open-state-changed', Lang.bind(this, this._onOpenStateChanged));
        this._display();

        if (this.initial_load_done)
            this._refreshAll();
        this._updateIconAndLabel();

        this._updateQuickLinksShutdownView();
	this._updateQuickLinksView();
        this._updateQuickLinks();
    },

    //
    //override getDisplayLayout to declare that this applet is suitable for both horizontal and
    // vertical orientations
    //
    getDisplayLayout: function() {
        return Applet.DisplayLayout.BOTH;
    },

    on_applet_added_to_panel: function () {
        this.initial_load_done = true;
    },

    _launch_editor: function() {
        Util.spawnCommandLine("cinnamon-menu-editor");
    },

    on_applet_clicked: function(event) {
        this.menu.toggle_with_options(this.enableAnimation);
    },

    _onSourceKeyPress: function(actor, event) {
        let symbol = event.get_key_symbol();

        if (symbol == Clutter.KEY_space || symbol == Clutter.KEY_Return) {
            this.menu.toggle();
            return true;
        } else if (symbol == Clutter.KEY_Escape && this.menu.isOpen) {
            this.menu.close();
            return true;
        } else if (symbol == Clutter.KEY_Down) {
            if (!this.menu.isOpen)
                this.menu.toggle();
            this.menu.actor.navigate_focus(this.actor, Gtk.DirectionType.DOWN, false);
            return true;
        } else
            return false;
    },

    _onOpenStateChanged: function(menu, open) {
        if (open) {
            this.menuIsOpening = true;
            this.actor.add_style_pseudo_class('active');
            global.stage.set_key_focus(this.searchEntry);
            this._selectedItemIndex = null;
            this._activeContainer = null;
            this._activeActor = null;

            if(visiblePane == "apps") {
                this._allAppsCategoryButton.actor.style_class = "menu-category-button-selected";
                this._select_category(null, this._allAppsCategoryButton);
            }

            if(this.menuLayout == "stark-menu")
                this.switchPanes("favs");


            let n = Math.min(this._applicationsButtons.length,
                             INITIAL_BUTTON_LOAD);
            for (let i = 0; i < n; i++) {
                this._applicationsButtons[i].actor.show();
            }
            //this._allAppsCategoryButton.actor.style_class = "menu-category-button-selected";
            Mainloop.idle_add(Lang.bind(this, this._initial_cat_selection, n));
        } else {
            this.actor.remove_style_pseudo_class('active');
            if (this.searchActive) {
                this.resetSearch();
            }
            this.selectedAppTitle.set_text("");
            this.selectedAppDescription.set_text("");
            this._previousTreeSelectedActor = null;
            this._previousSelectedActor = null;
            this.closeContextMenus(null, false);

            this._clearAllSelections(false);
            this.destroyVectorBox();
        }
    },

    _initial_cat_selection: function (start_index) {
        let n = this._applicationsButtons.length;
        for (let i = start_index; i < n; i++) {
            this._applicationsButtons[i].actor.show();
        }
    },

    destroy: function() {
        this.actor._delegate = null;
        this.menu.destroy();
        this.actor.destroy();
        this.emit('destroy');
    },

    _set_default_menu_icon: function() {
        let path = global.datadir + "/theme/menu.svg";
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            this.set_applet_icon_path(path);
            return;
        }

        path = global.datadir + "/theme/menu-symbolic.svg";
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            this.set_applet_icon_symbolic_path(path);
            return;
        }
        /* If all else fails, this will yield no icon */
        this.set_applet_icon_path("");
    },

    _updateIconAndLabel: function(){
        try {
            if (this.menuIconCustom) {
                if (this.menuIcon == "") {
                    this.set_applet_icon_name("");
                } else if (GLib.path_is_absolute(this.menuIcon) && GLib.file_test(this.menuIcon, GLib.FileTest.EXISTS)) {
                    if (this.menuIcon.search("-symbolic") != -1)
                        this.set_applet_icon_symbolic_path(this.menuIcon);
                    else
                        this.set_applet_icon_path(this.menuIcon);
                } else if (Gtk.IconTheme.get_default().has_icon(this.menuIcon)) {
                    if (this.menuIcon.search("-symbolic") != -1)
                        this.set_applet_icon_symbolic_name(this.menuIcon);
                    else
                        this.set_applet_icon_name(this.menuIcon);
                }
            } else {
                this._set_default_menu_icon();
            }
        } catch(e) {
           global.logWarning("Could not load icon file \""+this.menuIcon+"\" for menu button");
        }

        if (this.menuIconCustom && this.menuIcon == "") {
            this._applet_icon_box.hide();
        } else {
            this._applet_icon_box.show();
        }

        if (this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT)  // no menu label if in a vertical panel
        {
            this.set_applet_label("");
        }
        else {
            if (this.menuLabel != "")
                this.set_applet_label(_(this.menuLabel));
            else
                this.set_applet_label("");
        }
    },

    _updateCustomLabels: function(){
        this.rightButtonsBox.shutdown.label.set_text(_(this.shutdownLabel));
        this.rightButtonsBox.shutdown2.label.set_text(_(this.shutdownLabel));
        if (visiblePane == "apps")
            this.appsButton.label.set_text(" " + _(this.favoritesLabel));
        else
            this.appsButton.label.set_text(" " + _(this.allProgramsLabel));
    },

    _navigateContextMenu: function(actor, symbol, ctrlKey) {
        if (symbol === Clutter.KEY_Menu || symbol === Clutter.Escape ||
            (ctrlKey && (symbol === Clutter.KEY_Return || symbol === Clutter.KP_Enter))) {
            actor.activateContextMenus();
            return;
        }

        let goUp = symbol === Clutter.KEY_Up;
        let nextActive = null;
        let menuItems = actor.menu._getMenuItems(); // The context menu items

        // The first context menu item of a RecentButton is used just as a label.
        // So remove it from the iteration.
        if (actor instanceof RecentButton)
            menuItems.shift();

        let menuItemsLength = menuItems.length;

        switch (symbol) {
            case Clutter.KEY_Page_Up:
                this._activeContextMenuItem = menuItems[0];
                this._activeContextMenuItem.setActive(true);
                return;
            case Clutter.KEY_Page_Down:
                this._activeContextMenuItem = menuItems[menuItemsLength - 1];
                this._activeContextMenuItem.setActive(true);
                return;
        }

        if (!this._activeContextMenuItem) {
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KP_Enter) {
                actor.activate();
            } else {
                this._activeContextMenuItem = menuItems[goUp ? menuItemsLength - 1 : 0];
                this._activeContextMenuItem.setActive(true);
            }
            return;
        } else if (this._activeContextMenuItem &&
            (symbol === Clutter.KEY_Return || symbol === Clutter.KP_Enter)) {
            this._activeContextMenuItem.activate();
            this._activeContextMenuItem = null;
            return;
        }

        let i = 0;
        for (; i < menuItemsLength; i++) {
            if (menuItems[i] === this._activeContextMenuItem) {
                nextActive = goUp ? (menuItems[i - 1] || null) : (menuItems[i + 1] || null);
                break;
            }
        }

        if (!nextActive)
            nextActive = goUp ? menuItems[menuItemsLength - 1] : menuItems[0];

        nextActive.setActive(true);
        this._activeContextMenuItem = nextActive;
    },

    _onMenuKeyPress: function(actor, event) {
        let symbol = event.get_key_symbol();
        let item_actor;
        let index = 0;
        this.appBoxIter.reloadVisible();
        this.catBoxIter.reloadVisible();
        this.favBoxIter.reloadVisible();

        let keyCode = event.get_key_code();
        let modifierState = Cinnamon.get_event_state(event);

        /* check for a keybinding and quit early, otherwise we get a double hit
           of the keybinding callback */
        let action = global.display.get_keybinding_action(keyCode, modifierState);

        if (action == Meta.KeyBindingAction.CUSTOM) {
            return true;
        }

        index = this._selectedItemIndex;

        let ctrlKey = modifierState & Clutter.ModifierType.CONTROL_MASK;

        // If a context menu is open, hijack keyboard navigation and concentrate on the context menu.
        if (this._activeContextMenuParent && this._activeContextMenuParent._contextIsOpen &&
            (this._activeContainer === this.applicationsBox &&
            (this._activeContextMenuParent instanceof ApplicationButton ||
                this._activeContextMenuParent instanceof RecentButton)) ||
            (this._activeContainer === this.favoritesBox &&
                this._activeContextMenuParent instanceof FavoritesButton)) {
            let continueNavigation = false;
            switch (symbol) {
                case Clutter.KEY_Up:
                case Clutter.KEY_Down:
                case Clutter.KEY_Return:
                case Clutter.KP_Enter:
                case Clutter.KEY_Menu:
                case Clutter.KEY_Page_Up:
                case Clutter.KEY_Page_Down:
                case Clutter.Escape:
                    this._navigateContextMenu(this._activeContextMenuParent, symbol, ctrlKey);
                    break;
                case Clutter.KEY_Right:
                case Clutter.KEY_Left:
                case Clutter.Tab:
                case Clutter.ISO_Left_Tab:
                    continueNavigation = true;
                    break;
            }
            if (!continueNavigation)
                return true;
        }

        let navigationKey = true;
        let whichWay = "none";

        switch (symbol) {
            case Clutter.KEY_Up:
                whichWay = "up";
                if (this._activeContainer === this.favoritesBox && ctrlKey &&
                    (this.favoritesBox.get_child_at_index(index))._delegate instanceof FavoritesButton)
                    navigationKey = false;
                break;
            case Clutter.KEY_Down:
                whichWay = "down";
                if (this._activeContainer === this.favoritesBox && ctrlKey &&
                    (this.favoritesBox.get_child_at_index(index))._delegate instanceof FavoritesButton)
                    navigationKey = false;
                break;
            case Clutter.KEY_Page_Up:
                whichWay = "top"; break;
            case Clutter.KEY_Page_Down:
                whichWay = "bottom"; break;
            case Clutter.KEY_Right:
                if (!this.searchActive)
                    whichWay = "right";
                if (this._activeContainer === this.applicationsBox)
                    whichWay = "none";
                else if (this.activeContainer === this.categoriesBox && this.noRecentDocuments &&
                         (this.categoriesBox.get_child_at_index(index))._delegate instanceof RecentCategoryButton)
                    whichWay = "none";
                break;
            case Clutter.KEY_Left:
                if (!this.searchActive)
                    whichWay = "left";
                if (this._activeContainer === this.favoritesBox)
                    whichWay = "none";
                break;
            case Clutter.Tab:
                if (!this.searchActive)
                    whichWay = "right";
                else
                    navigationKey = false;
                break;
            case Clutter.ISO_Left_Tab:
                if (!this.searchActive)
                    whichWay = "left";
                else
                    navigationKey = false;
                break;
            default:
                navigationKey = false;
        }



        if (navigationKey) {
            switch (this._activeContainer) {
                case null:
                    switch (whichWay) {
                        case "up":
                            if(visiblePane == "favs") {
                                this._activeContainer = this.favoritesBox;
                                item_actor = this.favBoxIter.getLastVisible();
                            } else {
                                this._activeContainer = this.categoriesBox;
                                item_actor = this.catBoxIter.getLastVisible();
                                this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                                this._scrollToCategoryButton(item_actor._delegate);
                            }
                            break;
                        case "down":
                            if(visiblePane == "favs") {
                                this._activeContainer = this.favoritesBox;
                                item_actor = this.favBoxIter.getFirstVisible();
                            } else {
                                this._activeContainer = this.categoriesBox;
                                item_actor = this.catBoxIter.getFirstVisible();
                                item_actor = this._activeContainer._vis_iter.getNextVisible(item_actor);
                                this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                                this._scrollToCategoryButton(item_actor._delegate);
                            }
                            break;
                        case "right":
                            if(visiblePane == "favs") {
                                this._activeContainer = this.categoriesBox;
                                item_actor = this.catBoxIter.getFirstVisible();
                                this.switchPanes("apps");
                            } else {
                                this._activeContainer = this.applicationsBox;
                                item_actor = this.appBoxIter.getFirstVisible();
                                this._scrollToButton(item_actor._delegate);
                            }
                            break;
                        case "left":
                            this._activeContainer = this.favoritesBox;
                            item_actor = this.favBoxIter.getFirstVisible();
                            if(visiblePane == "apps")
                                this.switchPanes("favs");
                            break;
                        case "top":
                            if(visiblePane == "favs") {
                                this._activeContainer = this.favoritesBox;
                                item_actor = this.favBoxIter.getFirstVisible();
                            } else {
                                this._activeContainer = this.categoriesBox;
                                item_actor = this.catBoxIter.getFirstVisible();
                                this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                                this._scrollToCategoryButton(item_actor._delegate);
                            }
                            break;
                        case "bottom":
                            if(visiblePane == "favs") {
                                this._activeContainer = this.favoritesBox;
                                item_actor = this.favBoxIter.getLastVisible();
                            } else {
                                this._activeContainer = this.categoriesBox;
                                item_actor = this.catBoxIter.getLastVisible();
                                this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                                this._scrollToCategoryButton(item_actor._delegate);
                            }
                            break;
                    }
                    break;
                case this.categoriesBox:
                    switch (whichWay) {
                        case "up":
                            this._previousTreeSelectedActor = this.categoriesBox.get_child_at_index(index);
                            this._previousTreeSelectedActor._delegate.isHovered = false;
                            item_actor = this.catBoxIter.getPrevVisible(this._activeActor);
                            this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                            this._scrollToCategoryButton(item_actor._delegate);
                            break;
                        case "down":
                            this._previousTreeSelectedActor = this.categoriesBox.get_child_at_index(index);
                            this._previousTreeSelectedActor._delegate.isHovered = false;
                            item_actor = this.catBoxIter.getNextVisible(this._activeActor);
                            this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                            this._scrollToCategoryButton(item_actor._delegate);
                            break;
                        case "right":
                            if ((this.categoriesBox.get_child_at_index(index))._delegate instanceof RecentCategoryButton &&
                                this.noRecentDocuments) {
                                this._previousSelectedActor = this.categoriesBox.get_child_at_index(index);
                                item_actor = this.favBoxIter.getFirstVisible();
                                this.switchPanes("favs");
                            }
                            else {
                                item_actor = (this._previousVisibleIndex != null) ?
                                                this.appBoxIter.getVisibleItem(this._previousVisibleIndex) :
                                                this.appBoxIter.getFirstVisible();
                            }
                            break;
                        case "left":
                            this._previousSelectedActor = this.categoriesBox.get_child_at_index(index);
                            item_actor = this.favBoxIter.getFirstVisible();
                            //index = this.favBoxIter.getAbsoluteIndexOfChild(item_actor);
                            this.switchPanes("favs");
                            break;
                        case "top":
                            this._previousTreeSelectedActor = this.categoriesBox.get_child_at_index(index);
                            this._previousTreeSelectedActor._delegate.isHovered = false;
                            item_actor = this.catBoxIter.getFirstVisible();
                            this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                            this._scrollToCategoryButton(item_actor._delegate);
                            break;
                        case "bottom":
                            this._previousTreeSelectedActor = this.categoriesBox.get_child_at_index(index);
                            this._previousTreeSelectedActor._delegate.isHovered = false;
                            item_actor = this.catBoxIter.getLastVisible();
                            this._scrollToButton(this.appBoxIter.getFirstVisible()._delegate);
                            this._scrollToCategoryButton(item_actor._delegate);
                            break;
                    }
                    break;
                case this.applicationsBox:
                    switch (whichWay) {
                        case "up":
                            this._previousSelectedActor = this.applicationsBox.get_child_at_index(index);
                            item_actor = this.appBoxIter.getPrevVisible(this._previousSelectedActor);
                            this._previousVisibleIndex = this.appBoxIter.getVisibleIndex(item_actor);
                            this._scrollToButton(item_actor._delegate);
                            break;
                        case "down":
                            this._previousSelectedActor = this.applicationsBox.get_child_at_index(index);
                            item_actor = this.appBoxIter.getNextVisible(this._previousSelectedActor);
                            this._previousVisibleIndex = this.appBoxIter.getVisibleIndex(item_actor);
                            this._scrollToButton(item_actor._delegate);
                            break;
                        case "right":
                            this._previousSelectedActor = this.applicationsBox.get_child_at_index(index);
                            item_actor = (this._previousTreeSelectedActor != null) ?
                                            this._previousTreeSelectedActor :
                                            this.catBoxIter.getFirstVisible();
                            this._previousTreeSelectedActor = item_actor;
                            index = item_actor.get_parent()._vis_iter.getAbsoluteIndexOfChild(item_actor);

                            item_actor._delegate.emit('enter-event');
                            this._previousSelectedActor = this.categoriesBox.get_child_at_index(index);
                            item_actor = this.favBoxIter.getFirstVisible();
                            this.switchPanes("favs");
                            break;
                        case "left":
                            this._previousSelectedActor = this.applicationsBox.get_child_at_index(index);
                            item_actor = (this._previousTreeSelectedActor != null) ?
                                            this._previousTreeSelectedActor :
                                            this.catBoxIter.getFirstVisible();
                            this._previousTreeSelectedActor = item_actor;
                            break;
                        case "top":
                            item_actor = this.appBoxIter.getFirstVisible();
                            this._previousVisibleIndex = this.appBoxIter.getVisibleIndex(item_actor);
                            this._scrollToButton(item_actor._delegate);
                            break;
                        case "bottom":
                            item_actor = this.appBoxIter.getLastVisible();
                            this._previousVisibleIndex = this.appBoxIter.getVisibleIndex(item_actor);
                            this._scrollToButton(item_actor._delegate);
                            break;
                    }
                    break;
                case this.favoritesBox:
                    switch (whichWay) {
                        case "up":
                            this._previousSelectedActor = this.favoritesBox.get_child_at_index(index);
                            item_actor = this.favBoxIter.getPrevVisible(this._previousSelectedActor);
                            break;
                        case "down":
                            this._previousSelectedActor = this.favoritesBox.get_child_at_index(index);
                            item_actor = this.favBoxIter.getNextVisible(this._previousSelectedActor);
                            break;
                        case "right":
                            item_actor = (this._previousTreeSelectedActor != null) ?
                                            this._previousTreeSelectedActor :
                                            this.catBoxIter.getFirstVisible();
                            this._previousTreeSelectedActor = item_actor;
                            this.switchPanes("apps");
                            break;
                        case "left":
                            item_actor = (this._previousTreeSelectedActor != null) ?
                                            this._previousTreeSelectedActor :
                                            this.catBoxIter.getFirstVisible();
                            this._previousTreeSelectedActor = item_actor;
                            index = item_actor.get_parent()._vis_iter.getAbsoluteIndexOfChild(item_actor);

                            item_actor._delegate.emit('enter-event');
                            item_actor = (this._previousVisibleIndex != null) ?
                                            this.appBoxIter.getVisibleItem(this._previousVisibleIndex) :
                                            this.appBoxIter.getFirstVisible();
                            this.switchPanes("apps");
                            break;
                        case "top":
                            item_actor = this.favBoxIter.getFirstVisible();
                            break;
                        case "bottom":
                            item_actor = this.favBoxIter.getLastVisible();
                            break;
                    }
                    break;
                default:
                    break;
            }


/*            if (this._activeContainer === null && symbol == Clutter.KEY_Up) {
                if(visiblePane == "favs") {
                    this._activeContainer = this.favoritesBox;
                    item_actor = this.favBoxIter.getLastVisible();
                    index = this.favBoxIter.getAbsoluteIndexOfChild(item_actor);
                } else {
                    this._activeContainer = this.categoriesBox;
                    item_actor = this.catBoxIter.getLastVisible();
                    index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                }
                this._scrollToButton(item_actor._delegate);
            } else if (this._activeContainer === null && symbol == Clutter.KEY_Down) {
                if(visiblePane == "favs") {
                    this._activeContainer = this.favoritesBox;
                    item_actor = this.favBoxIter.getFirstVisible();
                    index = this.favBoxIter.getAbsoluteIndexOfChild(item_actor);
                } else {
                    this._activeContainer = this.categoriesBox;
                    item_actor = this.catBoxIter.getFirstVisible();
                    item_actor = this._activeContainer._vis_iter.getNextVisible(item_actor);
                    index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                }
                this._scrollToButton(item_actor._delegate);
            } else if (this._activeContainer === null && symbol == Clutter.KEY_Left) {
                this._activeContainer = this.favoritesBox;
                item_actor = this.favBoxIter.getFirstVisible();
                index = this.favBoxIter.getAbsoluteIndexOfChild(item_actor);
                if(visiblePane == "apps")
                    this.switchPanes("favs");
            } else if (this._activeContainer === null && symbol == Clutter.KEY_Right) {
                if(visiblePane == "favs") {
                    this._activeContainer = this.categoriesBox;
                    item_actor = this.catBoxIter.getFirstVisible();
                    index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                    this.switchPanes("apps");
                } else {
                    this._activeContainer = this.applicationsBox;
                    item_actor = this.appBoxIter.getFirstVisible();
                    index = this.appBoxIter.getAbsoluteIndexOfChild(item_actor);
                }
            } else if (symbol == Clutter.KEY_Up) {
                if (this._activeContainer != this.categoriesBox) {
                    this._previousSelectedActor = this._activeContainer.get_child_at_index(index);
                    item_actor = this._activeContainer._vis_iter.getPrevVisible(this._previousSelectedActor);
                    this._previousVisibleIndex = this._activeContainer._vis_iter.getVisibleIndex(item_actor);
                    index = this._activeContainer._vis_iter.getAbsoluteIndexOfChild(item_actor);
                    this._scrollToButton(item_actor._delegate);
                } else {
                    this._previousTreeSelectedActor = this.categoriesBox.get_child_at_index(index);
                    this._previousTreeSelectedActor._delegate.isHovered = false;
                    item_actor = this.catBoxIter.getPrevVisible(this._activeActor)
                    index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                    this._scrollToCategoryButton(item_actor._delegate);
                }
            } else if (symbol == Clutter.KEY_Down) {
                if (this._activeContainer != this.categoriesBox) {
                    this._previousSelectedActor = this._activeContainer.get_child_at_index(index);
                    item_actor = this._activeContainer._vis_iter.getNextVisible(this._previousSelectedActor);

                    this._previousVisibleIndex = this._activeContainer._vis_iter.getVisibleIndex(item_actor);
                    index = this._activeContainer._vis_iter.getAbsoluteIndexOfChild(item_actor);
                    this._scrollToButton(item_actor._delegate);
                } else {
                    this._previousTreeSelectedActor = this.categoriesBox.get_child_at_index(index);
                    this._previousTreeSelectedActor._delegate.isHovered = false;
                    item_actor = this.catBoxIter.getNextVisible(this._activeActor)
                    index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                    this._previousTreeSelectedActor._delegate.emit('leave-event');
                    this._scrollToCategoryButton(item_actor._delegate);
                }
            } else if (symbol == Clutter.KEY_Right && (this._activeContainer !== this.applicationsBox)) {
                if (this._activeContainer == this.categoriesBox) {
                    if (this._previousVisibleIndex !== null) {
                        item_actor = this.appBoxIter.getVisibleItem(this._previousVisibleIndex);
                    } else {
                        item_actor = this.appBoxIter.getFirstVisible();
                    }
                } else {
                    item_actor = (this._previousTreeSelectedActor != null) ? this._previousTreeSelectedActor : this.catBoxIter.getFirstVisible();
                    index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                    this._previousTreeSelectedActor = item_actor;
                    if(visiblePane == "favs")
                        this.switchPanes("apps");
                }
                index = item_actor.get_parent()._vis_iter.getAbsoluteIndexOfChild(item_actor);
            } else if (symbol == Clutter.KEY_Left && this._activeContainer === this.applicationsBox && !this.searchActive) {
                this._previousSelectedActor = this.applicationsBox.get_child_at_index(index);
                item_actor = (this._previousTreeSelectedActor != null) ? this._previousTreeSelectedActor : this.catBoxIter.getFirstVisible();
                index = this.catBoxIter.getAbsoluteIndexOfChild(item_actor);
                this._previousTreeSelectedActor = item_actor;
            } else if (symbol == Clutter.KEY_Left && this._activeContainer === this.categoriesBox && !this.searchActive) {
                this._previousSelectedActor = this.categoriesBox.get_child_at_index(index);
                item_actor = this.favBoxIter.getFirstVisible();
                index = this.favBoxIter.getAbsoluteIndexOfChild(item_actor);
                this.switchPanes("favs");
            }
*/
            if (!item_actor)
                return false;
            index = item_actor.get_parent()._vis_iter.getAbsoluteIndexOfChild(item_actor);
        } else {
            if (this._activeContainer !== this.categoriesBox && (symbol === Clutter.KEY_Return || symbol === Clutter.KP_Enter)) {
                if (!ctrlKey) {
                    item_actor = this._activeContainer.get_child_at_index(this._selectedItemIndex);
                    item_actor._delegate.activate();
                } else if (ctrlKey && (this._activeContainer === this.applicationsBox || this._activeContainer === this.favoritesBox)) {
                    item_actor = this._activeContainer.get_child_at_index(this._selectedItemIndex);
                    if (item_actor._delegate instanceof ApplicationButton ||
                        item_actor._delegate instanceof RecentButton ||
                        item_actor._delegate instanceof FavoritesButton)
                        item_actor._delegate.activateContextMenus();
                }
                return true;
            } else if ((this._activeContainer === this.applicationsBox || this._activeContainer === this.favoritesBox) &&
                       symbol === Clutter.KEY_Menu) {
                item_actor = this._activeContainer.get_child_at_index(this._selectedItemIndex);
                    if (item_actor._delegate instanceof ApplicationButton ||
                        item_actor._delegate instanceof RecentButton ||
                        item_actor._delegate instanceof FavoritesButton)
                        item_actor._delegate.activateContextMenus();
                return true;
            } else if (this._activeContainer === this.favoritesBox && symbol === Clutter.Delete) {
               item_actor = this.favoritesBox.get_child_at_index(this._selectedItemIndex);
                if (item_actor._delegate instanceof FavoritesButton) {
                    let favorites = AppFavorites.getAppFavorites().getFavorites();
                    let numFavorites = favorites.length;
                    AppFavorites.getAppFavorites().removeFavorite(item_actor._delegate.app.get_id());
                    if (this._selectedItemIndex == (2*numFavorites-2))
                        item_actor = this.favoritesBox.get_child_at_index(this._selectedItemIndex-2);
                    else
                        item_actor = this.favoritesBox.get_child_at_index(this._selectedItemIndex);
                }
            } else if (this._activeContainer === this.favoritesBox &&
                        (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_Up) && ctrlKey &&
                        (this.favoritesBox.get_child_at_index(index))._delegate instanceof FavoritesButton) {
                item_actor = this.favoritesBox.get_child_at_index(this._selectedItemIndex);
                let id = item_actor._delegate.app.get_id();
                let appFavorites = AppFavorites.getAppFavorites();
                let favorites = appFavorites.getFavorites();
                let numFavorites = favorites.length;
                let favPos = 0;
                if (this._selectedItemIndex == (2*numFavorites-2) && symbol === Clutter.KEY_Down)
                    favPos = 0;
                else if (this._selectedItemIndex == 0 && symbol === Clutter.KEY_Up)
                    favPos = 2*numFavorites-2;
                else if (symbol === Clutter.KEY_Down)
                    favPos = this._selectedItemIndex + 2;
                else
                    favPos = this._selectedItemIndex - 2;
                appFavorites.moveFavoriteToPos(id, favPos/2);
                item_actor = this.favoritesBox.get_child_at_index(favPos);
            } else if (this.searchFilesystem && (this._fileFolderAccessActive || symbol === Clutter.slash)) {
                if (symbol === Clutter.Return || symbol === Clutter.KP_Enter) {
                    if (this._run(this.searchEntry.get_text())) {
                        this.menu.close();
                    }
                    return true;
                }
                if (symbol === Clutter.Escape) {
                    this.searchEntry.set_text('');
                    this._fileFolderAccessActive = false;
                }
                if (symbol === Clutter.slash) {
                    // Need preload data before get completion. GFilenameCompleter load content of parent directory.
                    // Parent directory for /usr/include/ is /usr/. So need to add fake name('a').
                    let text = this.searchEntry.get_text().concat('/a');
                    let prefix;
                    if (text.lastIndexOf(' ') == -1)
                        prefix = text;
                    else
                        prefix = text.substr(text.lastIndexOf(' ') + 1);
                    this._getCompletion(prefix);

                    return false;
                }
                if (symbol === Clutter.Tab) {
                    let text = actor.get_text();
                    let prefix;
                    if (text.lastIndexOf(' ') == -1)
                        prefix = text;
                    else
                        prefix = text.substr(text.lastIndexOf(' ') + 1);
                    let postfix = this._getCompletion(prefix);
                    if (postfix != null && postfix.length > 0) {
                        actor.insert_text(postfix, -1);
                        actor.set_cursor_position(text.length + postfix.length);
                        if (postfix[postfix.length - 1] == '/')
                            this._getCompletion(text + postfix + 'a');
                    }
                    return true;
                }
                if (symbol === Clutter.ISO_Left_Tab) {
                    return true;
                }
                return false;
            } else if (symbol === Clutter.Tab || symbol === Clutter.ISO_Left_Tab) {
                return true;
            } else {
                return false;
            }
        }

        this._selectedItemIndex = index;
        if (!item_actor || item_actor === this.searchEntry) {
            return false;
        }
        item_actor._delegate.emit('enter-event');
        return true;
    },

    _addEnterEvent: function(button, callback) {
        let _callback = Lang.bind(this, function() {
            let parent = button.actor.get_parent();
            if (this._activeContainer === this.categoriesBox && parent !== this._activeContainer) {
                this._previousTreeSelectedActor = this._activeActor;
                this._previousSelectedActor = null;
            }
            if (this._previousTreeSelectedActor && this._activeContainer !== this.categoriesBox &&
                    parent !== this._activeContainer && button !== this._previousTreeSelectedActor && !this.searchActive) {
                this._previousTreeSelectedActor.style_class = "menu-category-button";
            }
            if (parent != this._activeContainer) {
                parent._vis_iter.reloadVisible();
            }
            let _maybePreviousActor = this._activeActor;
            if (_maybePreviousActor && this._activeContainer !== this.categoriesBox) {
                this._previousSelectedActor = _maybePreviousActor;
                this._clearPrevSelection();
            }
            if (parent === this.categoriesBox && !this.searchActive) {
                this._previousSelectedActor = _maybePreviousActor;
                this._clearPrevCatSelection();
            }
            this._activeContainer = parent;
            this._activeActor = button.actor;
            this._selectedItemIndex = this._activeContainer._vis_iter.getAbsoluteIndexOfChild(this._activeActor);
            callback();
        });
        button.connect('enter-event', _callback);
        button.actor.connect('enter-event', _callback);
    },

    _clearPrevSelection: function(actor) {
        if (this._previousSelectedActor && this._previousSelectedActor != actor) {
            if (this._previousSelectedActor._delegate instanceof ApplicationButton ||
                this._previousSelectedActor._delegate instanceof RecentButton ||
                this._previousSelectedActor._delegate instanceof SearchProviderResultButton ||
                this._previousSelectedActor._delegate instanceof PlaceButton ||
                this._previousSelectedActor._delegate instanceof RecentClearButton ||
                this._previousSelectedActor._delegate instanceof TransientButton)
                this._previousSelectedActor.style_class = "menu-application-button";
            else if (this._previousSelectedActor._delegate instanceof FavoritesButton ||
                     this._previousSelectedActor._delegate instanceof SystemButton)
                this._previousSelectedActor.remove_style_pseudo_class("hover");
        }
    },

    _clearPrevCatSelection: function(actor) {
        if (this._previousTreeSelectedActor && this._previousTreeSelectedActor != actor) {
            this._previousTreeSelectedActor.style_class = "menu-category-button";

            if (this._previousTreeSelectedActor._delegate) {
                this._previousTreeSelectedActor._delegate.emit('leave-event');
            }

            if (actor !== undefined) {
                this._previousVisibleIndex = null;
                this._previousTreeSelectedActor = actor;
            }
        } else {
            this.categoriesBox.get_children().forEach(Lang.bind(this, function (child) {
                child.style_class = "menu-category-button";
            }));
        }
    },

    makeVectorBox: function(actor) {
        this.destroyVectorBox(actor);
        let [mx, my, mask] = global.get_pointer();
        let [bx, by] = this.categoriesApplicationsBox.actor.get_transformed_position();
        let [bw, bh] = this.categoriesApplicationsBox.actor.get_transformed_size();
        let [aw, ah] = actor.get_transformed_size();
        let [ax, ay] = actor.get_transformed_position();
        let [appbox_x, appbox_y] = this.applicationsBox.get_transformed_position();

        let right_x = appbox_x - bx;
        let xformed_mouse_x = mx-bx;
        let xformed_mouse_y = my-by;
        let w = Math.max(right_x-xformed_mouse_x, 0);

        let ulc_y = xformed_mouse_y + 0;
        let llc_y = xformed_mouse_y + 0;

        this.vectorBox = new St.Polygon({ debug: false, width: w, height: bh,
                                          ulc_x: 0, ulc_y: ulc_y,
                                          llc_x: 0, llc_y: llc_y,
                                          urc_x: w, urc_y: 0,
                                          lrc_x: w, lrc_y: bh });

        this.categoriesApplicationsBox.actor.add_actor(this.vectorBox);
        this.vectorBox.set_position(xformed_mouse_x, 0);

        this.vectorBox.show();
        this.vectorBox.set_reactive(true);
        this.vectorBox.raise_top();

        this.vectorBox.connect("leave-event", Lang.bind(this, this.destroyVectorBox));
        this.vectorBox.connect("motion-event", Lang.bind(this, this.maybeUpdateVectorBox));
        this.actor_motion_id = actor.connect("motion-event", Lang.bind(this, this.maybeUpdateVectorBox));
        this.current_motion_actor = actor;
    },

    maybeUpdateVectorBox: function() {
        if (this.vector_update_loop) {
            Mainloop.source_remove(this.vector_update_loop);
            this.vector_update_loop = 0;
        }
        this.vector_update_loop = Mainloop.timeout_add(35, Lang.bind(this, this.updateVectorBox));
    },

    updateVectorBox: function(actor) {
        if (this.vectorBox) {
            let [mx, my, mask] = global.get_pointer();
            let [bx, by] = this.categoriesApplicationsBox.actor.get_transformed_position();
            let xformed_mouse_x = mx-bx;
            let [appbox_x, appbox_y] = this.applicationsBox.get_transformed_position();
            let right_x = appbox_x - bx;
            if ((right_x-xformed_mouse_x) > 0) {
                this.vectorBox.width = Math.max(right_x-xformed_mouse_x, 0);
                this.vectorBox.set_position(xformed_mouse_x, 0);
                this.vectorBox.urc_x = this.vectorBox.width;
                this.vectorBox.lrc_x = this.vectorBox.width;
                this.vectorBox.queue_repaint();
            } else {
                this.destroyVectorBox(actor);
            }
        }
        this.vector_update_loop = 0;
        return false;
    },

    destroyVectorBox: function(actor) {
        if (this.vectorBox != null) {
            this.vectorBox.destroy();
            this.vectorBox = null;
        }
        if (this.actor_motion_id > 0 && this.current_motion_actor != null) {
            this.current_motion_actor.disconnect(this.actor_motion_id);
            this.actor_motion_id = 0;
            this.current_motion_actor = null;
        }
    },

    _refreshPlaces : function() {
        for (let i = 0; i < this._placesButtons.length; i ++) {
            this._placesButtons[i].actor.destroy();
        }

        for (let i = 0; i < this._categoryButtons.length; i++) {
            if (this._categoryButtons[i] instanceof PlaceCategoryButton) {
                this._categoryButtons[i].actor.destroy();
            }
        }
        this._placesButtons = new Array();

        // Now generate Places category and places buttons and add to the list
        if (this.showPlaces) {
            this.placesButton = new PlaceCategoryButton(null, this.showCategoryIcons);
            this._addEnterEvent(this.placesButton, Lang.bind(this, function() {
                if (!this.searchActive) {
                    this.placesButton.isHovered = true;
                    if (this.hover_delay > 0) {
                        Tweener.addTween(this, {
                            time: this.hover_delay,
                            onComplete: function() {
                                if (this.placesButton.isHovered) {
                                    this._clearPrevCatSelection(this.placesButton);
                                    this.placesButton.actor.style_class = "menu-category-button-selected";
                                    this.closeContextMenus(null, false);
                                    this._displayButtons(null, -1);
                                } else {
                                    this.placesButton.actor.style_class = "menu-category-button";
                                }
                            }
                        });
                    } else {
                        this._clearPrevCatSelection(this.placesButton);
                        this.placesButton.actor.style_class = "menu-category-button-selected";
                        this.closeContextMenus(null, false);
                        this._displayButtons(null, -1);
                    }
                    this.makeVectorBox(this.placesButton.actor);
                }
            }));
            this.placesButton.actor.connect('leave-event', Lang.bind(this, function () {
                if (this._previousTreeSelectedActor === null) {
                    this._previousTreeSelectedActor = this.placesButton.actor;
                } else {
                    let prevIdx = this.catBoxIter.getVisibleIndex(this._previousTreeSelectedActor);
                    let nextIdx = this.catBoxIter.getVisibleIndex(this.placesButton.actor);
                    let idxDiff = Math.abs(prevIdx - nextIdx);
                    if (idxDiff <= 1 || Math.min(prevIdx, nextIdx) < 0) {
                        this._previousTreeSelectedActor = this.placesButton.actor;
                    }
                }

                this.placesButton.isHovered = false;
            }));
            this._categoryButtons.push(this.placesButton);
            this.categoriesBox.add_actor(this.placesButton.actor);

            let bookmarks = this._listBookmarks();
            let devices = this._listDevices();
            let places = bookmarks.concat(devices);
            for (let i = 0; i < places.length; i++) {
                let place = places[i];
                let button = new PlaceButton(this, place, place.name, this.showApplicationIcons);
                this._addEnterEvent(button, Lang.bind(this, function() {
                        this._clearPrevSelection(button.actor);
                        button.actor.style_class = "menu-application-button-selected";
                        this.selectedAppTitle.set_text("");
                    this.selectedAppDescription.set_text(button.place.id.slice(16).replace(/%20/g, ' '));
                }));
                button.actor.connect('leave-event', Lang.bind(this, function() {
                            this._previousSelectedActor = button.actor;
                            this.selectedAppTitle.set_text("");
                            this.selectedAppDescription.set_text("");
                            }));
                this._placesButtons.push(button);
                this.applicationsBox.add_actor(button.actor);
            }
        }

        this._setCategoriesButtonActive(!this.searchActive);

        //this._resizeApplicationsBox();
    },

    _refreshRecent : function() {
        for (let i = 0; i < this._recentButtons.length; i ++) {
            this._recentButtons[i].actor.destroy();
        }
        for (let i = 0; i < this._categoryButtons.length; i++) {
            if (this._categoryButtons[i] instanceof RecentCategoryButton) {
                this._categoryButtons[i].actor.destroy();
            }
        }
        this._recentButtons = new Array();

        // Now generate recent category and recent files buttons and add to the list
        if (this.privacy_settings.get_boolean(REMEMBER_RECENT_KEY)) {
            this.recentButton = new RecentCategoryButton(null, this.showCategoryIcons);
            this._addEnterEvent(this.recentButton, Lang.bind(this, function() {
                if (!this.searchActive) {
                    this.recentButton.isHovered = true;
                    if (this.hover_delay > 0) {
                        Tweener.addTween(this, {
                            time: this.hover_delay,
                            onComplete: function() {
                                if (this.recentButton.isHovered) {
                                    this._clearPrevCatSelection(this.recentButton.actor);
                                    this.recentButton.actor.style_class = "menu-category-button-selected";
                                    this.closeContextMenus(null, false);
                                    this._displayButtons(null, null, -1);
                                } else {
                                    this.recentButton.actor.style_class = "menu-category-button";
                                }
                            }
                        });
                    } else {
                        this._clearPrevCatSelection(this.recentButton.actor);
                        this.recentButton.actor.style_class = "menu-category-button-selected";
                        this.closeContextMenus(null, false);
                        this._displayButtons(null, null, -1);
                    }
                    this.makeVectorBox(this.recentButton.actor);
                }
            }));
            this.recentButton.actor.connect('leave-event', Lang.bind(this, function () {

                if (this._previousTreeSelectedActor === null) {
                    this._previousTreeSelectedActor = this.recentButton.actor;
                } else {
                    let prevIdx = this.catBoxIter.getVisibleIndex(this._previousTreeSelectedActor);
                    let nextIdx = this.catBoxIter.getVisibleIndex(this.recentButton.actor);

                    if (Math.abs(prevIdx - nextIdx) <= 1) {
                        this._previousTreeSelectedActor = this.recentButton.actor;
                    }
                }

                this.recentButton.isHovered = false;
            }));
            this.categoriesBox.add_actor(this.recentButton.actor);
            this._categoryButtons.push(this.recentButton);

            if (this.RecentManager._infosByTimestamp.length > 0) {
                for (let id = 0; id < MAX_RECENT_FILES && id < this.RecentManager._infosByTimestamp.length; id++) {
                    let button = new RecentButton(this, this.RecentManager._infosByTimestamp[id], this.showApplicationIcons);
                    this._addEnterEvent(button, Lang.bind(this, function() {
                            this._clearPrevSelection(button.actor);
                            button.actor.style_class = "menu-application-button-selected";
                            this.selectedAppTitle.set_text("");
                        this.selectedAppDescription.set_text(button.file.uri.slice(7).replace(/%20/g, ' '));
                    }));
                    button.actor.connect('leave-event', Lang.bind(this, function() {
                            button.actor.style_class = "menu-application-button";
                            this._previousSelectedActor = button.actor;
                            this.selectedAppTitle.set_text("");
                            this.selectedAppDescription.set_text("");
                            }));
                    this._recentButtons.push(button);
                    this.applicationsBox.add_actor(button.actor);
                    this.applicationsBox.add_actor(button.menu.actor);
                }

                let button = new RecentClearButton(this);
                this._addEnterEvent(button, Lang.bind(this, function() {
                        this._clearPrevSelection(button.actor);
                        button.actor.style_class = "menu-application-button-selected";
                        }));
                button.actor.connect('leave-event', Lang.bind(this, function() {
                        button.actor.style_class = "menu-application-button";
                        this._previousSelectedActor = button.actor;
                        }));
                this._recentButtons.push(button);
                this.applicationsBox.add_actor(button.actor);
                this.noRecentDocuments = false;
            } else {
                let button = new GenericButton(_("No recent documents"), null, false, null);
                this._recentButtons.push(button);
                this.applicationsBox.add_actor(button.actor);
                this.noRecentDocuments = true;
            }

        }

        this._setCategoriesButtonActive(!this.searchActive);

        //this._resizeApplicationsBox();
    },

    _refreshApps : function() {
        this.applicationsBox.destroy_all_children();
        this._applicationsButtons = new Array();
        this._transientButtons = new Array();
        this._applicationsButtonFromApp = new Object();
        this._applicationsBoxWidth = 0;
        //Remove all categories
        this.categoriesBox.destroy_all_children();

        this._allAppsCategoryButton = new CategoryButton(null);
        this._addEnterEvent(this._allAppsCategoryButton, Lang.bind(this, function() {
            if (!this.searchActive) {
                this._allAppsCategoryButton.isHovered = true;
                if (this.hover_delay > 0) {
                    Tweener.addTween(this, {
                        time: this.hover_delay,
                        onComplete: function() {
                            if (this._allAppsCategoryButton.isHovered) {
                                this._clearPrevCatSelection(this._allAppsCategoryButton.actor);
                                this._allAppsCategoryButton.actor.style_class = "menu-category-button-selected";
                                this._select_category(null, this._allAppsCategoryButton);
                            } else {
                                this._allAppsCategoryButton.actor.style_class = "menu-category-button";
                            }
                        }
                    });
                } else {
                    this._clearPrevCatSelection(this._allAppsCategoryButton.actor);
                    this._allAppsCategoryButton.actor.style_class = "menu-category-button-selected";
                    this._select_category(null, this._allAppsCategoryButton);
                }
                this.makeVectorBox(this._allAppsCategoryButton.actor);
            }
         }));
         this._allAppsCategoryButton.actor.connect('leave-event', Lang.bind(this, function () {
            this._previousSelectedActor = this._allAppsCategoryButton.actor;
            this._allAppsCategoryButton.isHovered = false;
         }));
         this.categoriesBox.add_actor(this._allAppsCategoryButton.actor);

        let trees = [appsys.get_tree()];

        for (var i in trees) {
            let tree = trees[i];
            let root = tree.get_root_directory();
            let dirs = [];
            let iter = root.iter();
            let nextType;

            while ((nextType = iter.next()) != CMenu.TreeItemType.INVALID) {
                if (nextType == CMenu.TreeItemType.DIRECTORY) {
                    dirs.push(iter.get_directory());
                }
            }

            let prefCats = ["administration", "preferences"];

            dirs = dirs.sort(function(a, b) {
                    let menuIdA = a.get_menu_id().toLowerCase();
                    let menuIdB = b.get_menu_id().toLowerCase();

                    let prefIdA = prefCats.indexOf(menuIdA);
                    let prefIdB = prefCats.indexOf(menuIdB);

                    if (prefIdA < 0 && prefIdB >= 0) {
                      return -1;
                    }
                    if (prefIdA >= 0 && prefIdB < 0) {
                      return 1;
                    }

                    let nameA = a.get_name().toLowerCase();
                    let nameB = b.get_name().toLowerCase();

                    if (nameA > nameB) {
                        return 1;
                    }
                    if (nameA < nameB) {
                        return -1;
                    }
                    return 0;
                });

            for (let i = 0; i < dirs.length; i++) {
                let dir = dirs[i];
                if (dir.get_is_nodisplay())
                    continue;
                if (this._loadCategory(dir)) {
                    let categoryButton = new CategoryButton(dir, this.showCategoryIcons);
                    this._addEnterEvent(categoryButton, Lang.bind(this, function() {
                        if (!this.searchActive) {
                            categoryButton.isHovered = true;
                            if (this.hover_delay > 0) {
                                Tweener.addTween(this, {
                                    time: this.hover_delay,
                                    onComplete: function() {
                                        if (categoryButton.isHovered) {
                                            this._clearPrevCatSelection(categoryButton.actor);
                                            categoryButton.actor.style_class = "menu-category-button-selected";
                                            this._select_category(dir, categoryButton);
                                        } else {
                                            categoryButton.actor.style_class = "menu-category-button";

                                        }
                                    }
                                });
                            } else {
                                this._clearPrevCatSelection(categoryButton.actor);
                                categoryButton.actor.style_class = "menu-category-button-selected";
                                this._select_category(dir, categoryButton);
                            }
                            this.makeVectorBox(categoryButton.actor);
                        }
                    }));
                  categoryButton.actor.connect('leave-event', Lang.bind(this, function () {
                        if (this._previousTreeSelectedActor === null) {
                            this._previousTreeSelectedActor = categoryButton.actor;
                        } else {
                            let prevIdx = this.catBoxIter.getVisibleIndex(this._previousTreeSelectedActor);
                            let nextIdx = this.catBoxIter.getVisibleIndex(categoryButton.actor);
                            if (Math.abs(prevIdx - nextIdx) <= 1) {
                                this._previousTreeSelectedActor = categoryButton.actor;
                            }
                        }
                        categoryButton.isHovered = false;
                  }));
                  this.categoriesBox.add_actor(categoryButton.actor);
                }
            }
        }
        // Sort apps and add to applicationsBox
        this._applicationsButtons.sort(function(a, b) {
            a = Util.latinise(a.app.get_name().toLowerCase());
            b = Util.latinise(b.app.get_name().toLowerCase());
            return a > b;
        });

        for (let i = 0; i < this._applicationsButtons.length; i++) {
            this.applicationsBox.add_actor(this._applicationsButtons[i].actor);
            this.applicationsBox.add_actor(this._applicationsButtons[i].menu.actor);
        }

        this._appsWereRefreshed = true;
    },

    _favEnterEvent : function(button) {
        button.actor.add_style_pseudo_class("hover");
        if (button instanceof FavoritesButton) {
            this.selectedAppTitle.set_text(button.app.get_name());
            if (button.app.get_description())
                this.selectedAppDescription.set_text(button.app.get_description().split("\n")[0]);
            else
                this.selectedAppDescription.set_text("");
        } else {
            this.selectedAppTitle.set_text(button.name);
            this.selectedAppDescription.set_text(button.desc);
        }
    },

    _favLeaveEvent : function(widget, event, button) {
        this._previousSelectedActor = button.actor;
        button.actor.remove_style_pseudo_class("hover");
        this.selectedAppTitle.set_text("");
        this.selectedAppDescription.set_text("");
    },

    _refreshFavs : function() {
        //Remove all favorites
        this.favoritesBox.destroy_all_children();

        //Load favorites again
        this._favoritesButtons = new Array();
        let launchers = global.settings.get_strv('favorite-apps');
        let appSys = Cinnamon.AppSystem.get_default();
        let j = 0;
        for ( let i = 0; i < launchers.length; ++i ) {
            let app = appSys.lookup_app(launchers[i]);
            if (app) {
                let button = new FavoritesButton(this, app, launchers.length, this.favorite_icon_size); // + 3 because we're adding 3 system buttons at the bottom
                this._favoritesButtons[app] = button;
                this.favoritesBox.add_actor(button.actor, { y_align: St.Align.END, y_fill: false });
                this.favoritesBox.add_actor(button.menu.actor, { y_align: St.Align.END, y_fill: false });

                this._addEnterEvent(button, Lang.bind(this, this._favEnterEvent, button));
                button.actor.connect('leave-event', Lang.bind(this, this._favLeaveEvent, button));

                ++j;
            }
        }
    },

    _loadCategory: function(dir, top_dir) {
        var iter = dir.iter();
        var has_entries = false;
        var nextType;
        if (!top_dir) top_dir = dir;
        while ((nextType = iter.next()) != CMenu.TreeItemType.INVALID) {
            if (nextType == CMenu.TreeItemType.ENTRY) {
                var entry = iter.get_entry();
                if (!entry.get_app_info().get_nodisplay()) {
                    has_entries = true;
                    var app = appsys.lookup_app_by_tree_entry(entry);
                    if (!app)
                        app = appsys.lookup_settings_app_by_tree_entry(entry);
                    var app_key = app.get_id()
                    if (app_key == null) {
                        app_key = app.get_name() + ":" +
                            app.get_description();
                    }
                    if (!(app_key in this._applicationsButtonFromApp)) {

                        let applicationButton = new ApplicationButton(this, app, this.showApplicationIcons);

                        var app_is_known = false;
                        for (var i = 0; i < this._knownApps.length; i++) {
                            if (this._knownApps[i] == app_key) {
                                app_is_known = true;
                            }
                        }
                        if (!app_is_known) {
                            if (this._appsWereRefreshed) {
                                applicationButton.highlight();
                            }
                            else {
                                this._knownApps.push(app_key);
                            }
                        }

                        applicationButton.actor.connect('leave-event', Lang.bind(this, this._appLeaveEvent, applicationButton));
                        this._addEnterEvent(applicationButton, Lang.bind(this, this._appEnterEvent, applicationButton));
                        this._applicationsButtons.push(applicationButton);
                        applicationButton.category.push(top_dir.get_menu_id());
                        this._applicationsButtonFromApp[app_key] = applicationButton;
                    } else {
                        this._applicationsButtonFromApp[app_key].category.push(dir.get_menu_id());
                    }
                }
            } else if (nextType == CMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (this._loadCategory(subdir, top_dir)) {
                    has_entries = true;
                }
            }
        }
        return has_entries;
    },

    _appLeaveEvent: function(a, b, applicationButton) {
        this._previousSelectedActor = applicationButton.actor;
        applicationButton.actor.style_class = "menu-application-button";
        this.selectedAppTitle.set_text("");
        this.selectedAppDescription.set_text("");
    },

    _appEnterEvent: function(applicationButton) {
        this.selectedAppTitle.set_text(applicationButton.app.get_name());
        if (applicationButton.app.get_description())
            this.selectedAppDescription.set_text(applicationButton.app.get_description());
        else
            this.selectedAppDescription.set_text("");
        this._previousVisibleIndex = this.appBoxIter.getVisibleIndex(applicationButton.actor);
        this._clearPrevSelection(applicationButton.actor);
        applicationButton.actor.style_class = "menu-application-button-selected";
    },

    _scrollToButton: function(button) {
        var current_scroll_value = this.applicationsScrollBox.get_vscroll_bar().get_adjustment().get_value();
        var box_height = this.applicationsScrollBox.get_allocation_box().y2-this.applicationsScrollBox.get_allocation_box().y1;
        var new_scroll_value = current_scroll_value;
        if (current_scroll_value > button.actor.get_allocation_box().y1-10) new_scroll_value = button.actor.get_allocation_box().y1-10;
        if (box_height+current_scroll_value < button.actor.get_allocation_box().y2+10) new_scroll_value = button.actor.get_allocation_box().y2-box_height+10;
        if (new_scroll_value!=current_scroll_value) this.applicationsScrollBox.get_vscroll_bar().get_adjustment().set_value(new_scroll_value);
    },

    _scrollToCategoryButton: function(button) {
        var current_scroll_value = this.categoriesScrollBox.get_vscroll_bar().get_adjustment().get_value();
        var box_height = this.categoriesScrollBox.get_allocation_box().y2 - this.categoriesScrollBox.get_allocation_box().y1;
        var new_scroll_value = current_scroll_value;
        if (current_scroll_value > button.actor.get_allocation_box().y1 - 10) new_scroll_value = button.actor.get_allocation_box().y1 - 10;
        if (box_height + current_scroll_value < button.actor.get_allocation_box().y2 + 10) new_scroll_value = button.actor.get_allocation_box().y2 - box_height + 10;
        if (new_scroll_value != current_scroll_value) this.categoriesScrollBox.get_vscroll_bar().get_adjustment().set_value(new_scroll_value);
    },

    _display : function() {
        this._activeContainer = null;
        this._activeActor = null;
        this.vectorBox = null;
        this.actor_motion_id = 0;
        this.vector_update_loop = null;
        this.current_motion_actor = null;
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);

        this.leftPane = new St.Bin();

        this.favsBox = new St.BoxLayout({ vertical: true });
        this.favsBox.style = "min-height: 415px;min-width: 235px;";

        this.appsBox = new St.BoxLayout({ vertical: true });

        this.searchBox = new St.BoxLayout({ style_class: 'menu-search-box' });
        this.searchBox.add_style_class_name("starkmenu-search-box");
        this.searchBox.set_style("padding-right: 0px;padding-left: 0px;height:26px;");

        this.searchEntry = new St.Entry({ name: 'menu-search-entry',
                                     hint_text: _("Type to search..."),
                                     track_hover: true,
                                     can_focus: true });
        this.searchEntry.set_secondary_icon(this._searchInactiveIcon);
        this.searchActive = false;
        this.searchEntryText = this.searchEntry.clutter_text;
        this.searchEntryText.connect('text-changed', Lang.bind(this, this._onSearchTextChanged));
        this.searchEntryText.connect('key-press-event', Lang.bind(this, this._onMenuKeyPress));
        this._previousSearchPattern = "";


        this.categoriesApplicationsBox = new CategoriesApplicationsBox();

        this.categoriesBox = new St.BoxLayout({ style_class: 'menu-categories-box',
                                                vertical: true,
                                                accessible_role: Atk.Role.LIST });
        this.applicationsScrollBox = new St.ScrollView({ x_fill: true, y_fill: false, y_align: St.Align.START, style_class: 'vfade menu-applications-scrollbox' });
        //this.applicationsScrollBox.set_width(264);

        this.categoriesScrollBox = new St.ScrollView({ x_fill: true, y_fill: false, y_align: St.Align.START, style_class: 'vfade menu-applications-scrollbox' });
        //this.categoriesScrollBox.set_width(210);

        this.a11y_settings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.a11y.applications" });
        this.a11y_settings.connect("changed::screen-magnifier-enabled", Lang.bind(this, this._updateVFade));
        this.a11y_mag_settings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.a11y.magnifier" });
        this.a11y_mag_settings.connect("changed::mag-factor", Lang.bind(this, this._updateVFade));

        this._updateVFade();

        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-autoscroll", "autoscroll_enabled", this._update_autoscroll, null);
        this._update_autoscroll();

        this.settings.bindProperty(Settings.BindingDirection.IN, "favorite-icon-size", "favorite_icon_size", this._refreshFavs, null);

        let vscroll = this.applicationsScrollBox.get_vscroll_bar();
        vscroll.connect('scroll-start',
                        Lang.bind(this, function() {
                                      this.menu.passEvents = true;
                                  }));
        vscroll.connect('scroll-stop',
                        Lang.bind(this, function() {
                                      this.menu.passEvents = false;
                                  }));

        let vscrollCat = this.categoriesScrollBox.get_vscroll_bar();
        vscrollCat.connect('scroll-start',
                        Lang.bind(this, function() {
                                      this.menu.passEvents = true;
                                  }));
        vscrollCat.connect('scroll-stop',
                        Lang.bind(this, function() {
                                       this.menu.passEvents = false;
                                  }));

        this.applicationsBox = new St.BoxLayout({ style_class: 'menu-applications-inner-box', vertical:true });
        this.applicationsBox.add_style_class_name('menu-applications-box'); //this is to support old themes
        this.applicationsBox.add_style_class_name('starkmenu-applications-inner-box');
        this.applicationsScrollBox.add_actor(this.applicationsBox);
        this.categoriesScrollBox.add_actor(this.categoriesBox);
        this.applicationsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.categoriesScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.categoriesApplicationsBox.actor.add_actor(this.categoriesScrollBox);
        this.categoriesApplicationsBox.actor.add_actor(this.applicationsScrollBox);

        let fav_obj = new FavoritesBox();
        this.favoritesBox = fav_obj.actor;
        this.favsBox.add_actor(this.favoritesBox, { y_align: St.Align.END, y_fill: false });

        this.separator = new PopupMenu.PopupSeparatorMenuItem();
        this.separator.actor.set_style("padding: 0em 1em;");

        this.appsButton = new AllProgramsItem(_(this.allProgramsLabel), "forward", this, false);

        this.leftPaneBox = new St.BoxLayout({
            style_class: 'menu-favorites-box',
            vertical: true
        });
        this.leftPaneBox.add_style_class_name("starkmenu-favorites-box");

        this.rightButtonsBox = new RightButtonsBox(this, this.menu);

        this.rightButtonsBox.actor.style_class = "right-buttons-box";

        this.mainBox = new St.BoxLayout({ style_class: 'menu-applications-outer-box', vertical:false });
        this.mainBox.add_style_class_name('menu-applications-box'); //this is to support old themes
        this.mainBox.add_style_class_name("starkmenu-applications-box");

        this.leftPane.set_child(this.favsBox, { y_align: St.Align.END, y_fill: false });

        this.selectedAppBox = new St.BoxLayout({ style_class: 'menu-selected-app-box', vertical: true });
        //this.selectedAppBox.add_style_class_name("starkmenu-selected-app-box");

        //if (this.selectedAppBox.peek_theme_node() == null ||
        //    this.selectedAppBox.get_theme_node().get_length('height') == 0)
        //    this.selectedAppBox.set_height(0 * global.ui_scale);

        this.selectedAppTitle = new St.Label({ style_class: 'menu-selected-app-title', text: "" });
        this.selectedAppBox.add_actor(this.selectedAppTitle);
        this.selectedAppDescription = new St.Label({ style_class: 'menu-selected-app-description', text: "" });
        this.selectedAppBox.add_actor(this.selectedAppDescription);
        //this.appsBox.add_actor(this.selectedAppBox);
        this.appsBox.add_actor(this.categoriesApplicationsBox.actor);
        this.searchBox.add_actor(this.searchEntry);
        this.leftPaneBox.add_actor(this.leftPane);
        this.leftPaneBox.add_actor(this.separator.actor);
        this.leftPaneBox.add_actor(this.appsButton.actor);
        this.leftPaneBox.add_actor(this.searchBox);
        this.mainBox.add_actor(this.leftPaneBox);
        this.mainBox.add_actor(this.rightButtonsBox.actor);

        section.actor.add_actor(this.mainBox);
        //section.actor.add_actor(this.selectedAppBox);

        this.appBoxIter = new VisibleChildIterator(this.applicationsBox);
        this.applicationsBox._vis_iter = this.appBoxIter;
        this.catBoxIter = new VisibleChildIterator(this.categoriesBox);
        this.categoriesBox._vis_iter = this.catBoxIter;
        this.favBoxIter = new VisibleChildIterator(this.favoritesBox);
        this.favoritesBox._vis_iter = this.favBoxIter;
        Mainloop.idle_add(Lang.bind(this, function() {
            this._clearAllSelections(false);
        }));
    },

    _updateMenuLayout: function() {
        this.mainBox.remove_actor(this.rightButtonsBox.actor);
        this.mainBox.remove_actor(this.leftPaneBox);
        if(this.menuLayout == "mate-menu") {
            this.rightButtonsBox.actor.set_style("padding-right: 8px;");
            this.mainBox.add_actor(this.rightButtonsBox.actor);
            this.mainBox.add_actor(this.leftPaneBox);
        } else {
            this.rightButtonsBox.actor.set_style("padding-left: 8px;");
            this.mainBox.add_actor(this.leftPaneBox);
            this.mainBox.add_actor(this.rightButtonsBox.actor);
        }
        this._appletStyles();
    },

    switchPanes: function(pane) {
        if (pane == "apps") {
            this.leftPane.set_child(this.appsBox);
            this.separator.actor.hide();
            this.appsButton.label.set_text(" " + _(this.favoritesLabel));
            this.appsButton.icon.set_icon_name("back");
            if(this.menuLayout == "stark-menu")
                this.rightButtonsBox.actor.hide();
            this._appletStyles("apps");
            visiblePane = "apps";
            if (this._previousTreeSelectedActor == null)
                this._allAppsCategoryButton.actor.style_class = "menu-category-button-selected";
        } else {
            this.leftPane.set_child(this.favsBox);
            this.separator.actor.show();
            this.appsButton.label.set_text(" " + _(this.allProgramsLabel));
            this.appsButton.icon.set_icon_name("forward");
            if (this.menu.showQuicklinks) {
                this.rightButtonsBox.actor.show();
            }
            this._appletStyles("favs");
            visiblePane = "favs";
            if (this._previousTreeSelectedActor == null)
                this._allAppsCategoryButton.actor.style_class = "menu-category-button-selected";
        }
    },

    _updateVFade: function() {
        let mag_on = this.a11y_settings.get_boolean("screen-magnifier-enabled") &&
                     this.a11y_mag_settings.get_double("mag-factor") > 1.0;
        if (mag_on) {
            this.applicationsScrollBox.style_class = "menu-applications-scrollbox";
            this.categoriesScrollBox.style_class = "menu-applications-scrollbox";
        } else {
            this.applicationsScrollBox.style_class = "vfade menu-applications-scrollbox";
            this.categoriesScrollBox.style_class = "vfade menu-applications-scrollbox";
        }
    },

    _update_autoscroll: function() {
        this.applicationsScrollBox.set_auto_scrolling(this.autoscroll_enabled);
        this.categoriesScrollBox.set_auto_scrolling(this.autoscroll_enabled);
    },

    _clearAllSelections: function(hide_apps) {
        let actors = this.applicationsBox.get_children();
        for (var i=0; i<actors.length; i++) {
            let actor = actors[i];
            actor.style_class = "menu-application-button";
            if (hide_apps) {
                actor.hide();
            }
        }
        let actors = this.categoriesBox.get_children();
        for (var i=0; i<actors.length; i++){
            let actor = actors[i];
            actor.style_class = "menu-category-button";
            actor.show();
        }
        let actors = this.favoritesBox.get_children();
        for (var i=0; i<actors.length; i++){
            let actor = actors[i];
            actor.remove_style_pseudo_class("hover");
            if (hide_apps) {
                actor.hide();
            }
        }
    },

    _select_category : function(dir, categoryButton) {
        if (dir)
            this._displayButtons(this._listApplications(dir.get_menu_id()));
        else
            this._displayButtons(this._listApplications(null));
        this.closeContextMenus(null, false);
    },

    closeContextMenus: function(excluded, animate) {
        for (var app in this._applicationsButtons){
            if (app != excluded && this._applicationsButtons[app].menu.isOpen){
                if (animate)
                    this._applicationsButtons[app].toggleMenu();
                else
                    this._applicationsButtons[app].closeMenu();
            }
        }

        for (var recent in this._recentButtons){
            if (recent != excluded && this._recentButtons[recent].menu.isOpen){
                if (animate)
                    this._recentButtons[recent].toggleMenu();
                else
                    this._recentButtons[recent].closeMenu();
            }
        }

        for (var app in this._favoritesButtons){
            if (app != excluded && this._favoritesButtons[app].menu.isOpen){
                if (animate)
                    this._favoritesButtons[app].toggleMenu();
                else
                    this._favoritesButtons[app].closeMenu();
            }
        }
    },

    _resize_actor_iter: function(actor) {
        let [min, nat] = actor.get_preferred_width(-1.0);
        if (nat > this._applicationsBoxWidth){
            this._applicationsBoxWidth = nat;
            this.applicationsBox.set_width(this._applicationsBoxWidth + 42); // The answer to life...
        }
    },

    _resizeApplicationsBox: function() {
        this._applicationsBoxWidth = 0;
        this.applicationsBox.set_width(-1);
        let child = this.applicationsBox.get_first_child();
        this._resize_actor_iter(child);

        while ((child = child.get_next_sibling()) != null) {
            this._resize_actor_iter(child);
        }
    },

    _displayButtons: function(appCategory, places, recent, apps, autocompletes){
        let innerapps = this.applicationsBox.get_children();
        for (var i in innerapps) {
            innerapps[i].hide();
        }
        if (appCategory) {
            if (appCategory == "all") {
                this._applicationsButtons.forEach( function (item, index) {
                    if (!item.actor.visible) {
                        item.actor.show();
                    }
                });
            } else {
                this._applicationsButtons.forEach( function (item, index) {
                    if (item.category.indexOf(appCategory) != -1) {
                        if (!item.actor.visible) {
                            item.actor.show();
                        }
                    } else {
                        if (item.actor.visible) {
                            item.actor.hide();
                        }
                    }
                });
            }
        } else if (apps) {
            for (let i = 0; i < this._applicationsButtons.length; i++) {
                if (apps.indexOf(this._applicationsButtons[i].app.get_id()) != -1) {
                    if (!this._applicationsButtons[i].actor.visible) {
                        this._applicationsButtons[i].actor.show();
                    }
                } else {
                    if (this._applicationsButtons[i].actor.visible) {
                        this._applicationsButtons[i].actor.hide();
                    }
                }
            }
        } else {
            this._applicationsButtons.forEach( function (item, index) {
                if (item.actor.visible) {
                    item.actor.hide();
                }
            });
        }
        if (places) {
            if (places == -1) {
                this._placesButtons.forEach( function (item, index) {
                   item.actor.show();
                });
            } else {
                for (let i = 0; i < this._placesButtons.length; i++) {
                    if (places.indexOf(this._placesButtons[i].button_name) != -1) {
                        if (!this._placesButtons[i].actor.visible) {
                            this._placesButtons[i].actor.show();
                        }
                    } else {
                        if (this._placesButtons[i].actor.visible) {
                            this._placesButtons[i].actor.hide();
                        }
                    }
                }
            }
        } else {
            this._placesButtons.forEach( function (item, index) {
                if (item.actor.visible) {
                    item.actor.hide();
                }
            });
        }
        if (recent) {
            if (recent == -1) {
                this._recentButtons.forEach( function (item, index) {
                    if (!item.actor.visible) {
                        item.actor.show();
                    }
                });
            } else {
                for (let i = 0; i < this._recentButtons.length; i++) {
                    if (recent.indexOf(this._recentButtons[i].button_name) != -1) {
                        if (!this._recentButtons[i].actor.visible) {
                            this._recentButtons[i].actor.show();
                        }
                    } else {
                        if (this._recentButtons[i].actor.visible) {
                            this._recentButtons[i].actor.hide();
                        }
                    }
                }
            }
        } else {
            this._recentButtons.forEach( function (item, index) {
                if (item.actor.visible) {
                    item.actor.hide();
                }
            });
        }
        if (autocompletes) {

            this._transientButtons.forEach( function (item, index) {
                item.actor.destroy();
            });
            this._transientButtons = new Array();

            for (let i = 0; i < autocompletes.length; i++) {
                let button = new TransientButton(this, autocompletes[i]);
                button.actor.connect('leave-event', Lang.bind(this, this._appLeaveEvent, button));
                this._addEnterEvent(button, Lang.bind(this, this._appEnterEvent, button));
                this._transientButtons.push(button);
                this.applicationsBox.add_actor(button.actor);
                button.actor.realize();
            }
        }

        this._searchProviderButtons.forEach( function (item, index) {
            if (item.actor.visible) {
                item.actor.hide();
            }
        });
    },

    _setCategoriesButtonActive: function(active) {
        try {
            let categoriesButtons = this.categoriesBox.get_children();
            for (var i in categoriesButtons) {
                let button = categoriesButtons[i];
                if (active){
                    button.set_style_class_name("menu-category-button");
                } else {
                    button.set_style_class_name("menu-category-button-greyed");
                }
             }
        } catch (e) {
            global.log(e);
        }
     },

     resetSearch: function(){
        this.searchEntry.set_text("");
        this._previousSearchPattern = "";
        this.searchActive = false;
        this._clearAllSelections(false);
        this._setCategoriesButtonActive(true);
        global.stage.set_key_focus(this.searchEntry);
     },

     _onSearchTextChanged: function (se, prop) {
        if (this.menuIsOpening) {
            this.menuIsOpening = false;
            return;
        } else {
            let searchString = this.searchEntry.get_text();
            if (searchString == '' && !this.searchActive)
                return;
            this.searchActive = searchString != '';
            this._fileFolderAccessActive = this.searchActive && this.searchFilesystem;
            this._clearAllSelections();

            if (this.searchActive) {
                this.searchEntry.set_secondary_icon(this._searchActiveIcon);
                if (this._searchIconClickedId == 0) {
                    this._searchIconClickedId = this.searchEntry.connect('secondary-icon-clicked',
                        Lang.bind(this, function() {
                            this.resetSearch();
                            this._select_category(null, this._allAppsCategoryButton);
                        }));
                }
                this._setCategoriesButtonActive(false);
                this._doSearch();
            } else {
                if (this._searchIconClickedId > 0)
                    this.searchEntry.disconnect(this._searchIconClickedId);
                this._searchIconClickedId = 0;
                this.searchEntry.set_secondary_icon(this._searchInactiveIcon);
                this._previousSearchPattern = "";
                this._setCategoriesButtonActive(true);
                this._select_category(null, this._allAppsCategoryButton);
            }
            return;
        }
    },

    _listBookmarks: function(pattern){
       let bookmarks = Main.placesManager.getBookmarks();
       var res = new Array();
       for (let id = 0; id < bookmarks.length; id++) {
          if (!pattern || bookmarks[id].name.toLowerCase().indexOf(pattern)!=-1) res.push(bookmarks[id]);
       }
       return res;
    },

    _listDevices: function(pattern){
       let devices = Main.placesManager.getMounts();
       var res = new Array();
       for (let id = 0; id < devices.length; id++) {
          if (!pattern || devices[id].name.toLowerCase().indexOf(pattern)!=-1) res.push(devices[id]);
       }
       return res;
    },

    _listApplications: function(category_menu_id, pattern){
        var applist = new Array();
        if (category_menu_id) {
            applist = category_menu_id;
        } else {
            applist = "all";
        }
        let res;
        if (pattern){
            res = new Array();
            for (var i in this._applicationsButtons) {
                let app = this._applicationsButtons[i].app;
                if (app.get_name().toLowerCase().indexOf(pattern) != -1 ||
                    (app.get_description() && app.get_description().toLowerCase().indexOf(pattern) != -1) ||
                    (app.get_id() && app.get_id().slice(0, -8).toLowerCase().indexOf(pattern) != -1))
                    res.push(app.get_id());
            }
        } else res = applist;
        return res;
    },

    _doSearch: function(){
        if (this.leftPane.get_child() == this.favsBox) this.switchPanes("apps");
        this._searchTimeoutId = 0;
        let pattern = this.searchEntryText.get_text().replace(/^\s+/g, '').replace(/\s+$/g, '').toLowerCase();
        if (pattern==this._previousSearchPattern) return false;
        this._previousSearchPattern = pattern;
        this._activeContainer = null;
        this._activeActor = null;
        this._selectedItemIndex = null;
        this._previousTreeSelectedActor = null;
        this._previousSelectedActor = null;

       // _listApplications returns all the applications when the search
       // string is zero length. This will happened if you type a space
       // in the search entry.
        if (pattern.length == 0) {
            return false;
        }

        var appResults = this._listApplications(null, pattern);
        var placesResults = new Array();
        var bookmarks = this._listBookmarks(pattern);
        for (var i in bookmarks)
            placesResults.push(bookmarks[i].name);
        var devices = this._listDevices(pattern);
        for (var i in devices)
            placesResults.push(devices[i].name);
        var recentResults = new Array();
        for (let i = 0; i < this._recentButtons.length; i++) {
            if (!(this._recentButtons[i] instanceof RecentClearButton) && this._recentButtons[i].button_name.toLowerCase().indexOf(pattern) != -1)
                recentResults.push(this._recentButtons[i].button_name);
        }

        var acResults = new Array(); // search box autocompletion results
        if (this.searchFilesystem) {
            // Don't use the pattern here, as filesystem is case sensitive
            acResults = this._getCompletions(this.searchEntryText.get_text());
        }

        this._displayButtons(null, placesResults, recentResults, appResults, acResults);

        this.appBoxIter.reloadVisible();
        if (this.appBoxIter.getNumVisibleChildren() > 0) {
            let item_actor = this.appBoxIter.getFirstVisible();
            this._selectedItemIndex = this.appBoxIter.getAbsoluteIndexOfChild(item_actor);
            this._activeContainer = this.applicationsBox;
            if (item_actor && item_actor != this.searchEntry) {
                item_actor._delegate.emit('enter-event');
            }
        }

        SearchProviderManager.launch_all(pattern, Lang.bind(this, function(provider, results){
            try{
            for (var i in results){
                if (results[i].type != 'software')
                {
                    let button = new SearchProviderResultButton(this, provider, results[i]);
                    button.actor.connect('leave-event', Lang.bind(this, this._appLeaveEvent, button));
                    this._addEnterEvent(button, Lang.bind(this, this._appEnterEvent, button));
                    this._searchProviderButtons.push(button);
                    this.applicationsBox.add_actor(button.actor);
                    button.actor.realize();
                }
            }
            }catch(e){global.log(e);}
        }));

        return false;
    },

    _getCompletion : function(text) {
        if (text.indexOf('/') != -1) {
            if (text.substr(text.length - 1) == '/') {
                return '';
            } else {
                return this._pathCompleter.get_completion_suffix(text);
            }
        } else {
            return false;
        }
    },

    _getCompletions : function(text) {
        if (text.indexOf('/') != -1) {
            return this._pathCompleter.get_completions(text);
        } else {
            return new Array();
        }
    },

    _run : function(input) {
        let command = input;

        this._commandError = false;
        if (input) {
            let path = null;
            if (input.charAt(0) == '/') {
                path = input;
            } else {
                if (input.charAt(0) == '~')
                    input = input.slice(1);
                path = GLib.get_home_dir() + '/' + input;
            }

            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                let file = Gio.file_new_for_path(path);
                try {
                    Gio.app_info_launch_default_for_uri(file.get_uri(),
                                                        global.create_app_launch_context());
                } catch (e) {
                    // The exception from gjs contains an error string like:
                    //     Error invoking Gio.app_info_launch_default_for_uri: No application
                    //     is registered as handling this file
                    // We are only interested in the part after the first colon.
                    //let message = e.message.replace(/[^:]*: *(.+)/, '$1');
                    return false;
                }
            } else {
                return false;
            }
        }

        return true;
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    let myApplet = new MyApplet(orientation, panel_height, instance_id);
    return myApplet;
}
