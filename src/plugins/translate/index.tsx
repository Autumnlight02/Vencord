/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import { addChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addAccessory, removeAccessory } from "@api/MessageAccessories";
import { addPreSendListener, removePreSendListener } from "@api/MessageEvents";
import { addButton, removeButton } from "@api/MessagePopover";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore, FluxDispatcher, Menu, MessageStore } from "@webpack/common";
import { Message } from "discord-types/general";

import { settings } from "./settings";
import { TranslateChatBarIcon, TranslateIcon } from "./TranslateIcon";
import { handleTranslate, TranslationAccessory } from "./TranslationAccessory";
import { translate, TranslationValue } from "./utils";

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }) => {

    if (!message.content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-trans"
            label="Translate"
            icon={TranslateIcon}
            action={async () => {
                const trans = await translate("received", message.content);
                handleTranslate(message.id, trans);
            }}
        />
    ));
};
const translatedMessages = new Map<string, TranslationValue>();

export default definePlugin({
    name: "Translate",
    description: "Translate messages with Google Translate or DeepL",
    authors: [Devs.Ven, Devs.AshtonMemer],
    dependencies: ["MessageAccessoriesAPI", "MessagePopoverAPI", "MessageEventsAPI", "ChatInputButtonAPI"],
    settings,
    contextMenus: {
        "message": messageCtxPatch
    },
    // not used, just here in case some other plugin wants it or w/e
    translate,

    start() {
        addAccessory("vc-translation", props => <TranslationAccessory message={props.message} />);

        addChatBarButton("vc-translate", TranslateChatBarIcon);

        // TODO figure out initial channel
        let currentChannel = "";


        FluxDispatcher.subscribe("CHANNEL_SELECT", e => {
            console.log(e);
            currentChannel = e.channelId;
            const messages = MessageStore.getMessages(e.channelId);
            restoreCachedTranslations(messages._array as Message[]);
        });

        FluxDispatcher.subscribe("MESSAGE_CREATE", messageBase => {
            if (settings.store.autoTranslateLiveChat === false) return;
            if (messageBase.message.content.includes("|>>")) return;

            if (messageBase.channelId === currentChannel) {
                handleTranslation(messageBase.message);
            }
        });

        addButton("vc-translate", message => {
            if (!message.content) return null;
            return {
                label: "Translate",
                icon: TranslateIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: async () => {
                    console.log(ChannelStore.getChannel(message.channel_id));
                    handleTranslation(message);
                },
            };
        });


        addButton("vc-translate-all", message => {
            if (!message.content) return null;
            return {
                label: "Translate All Messages",
                icon: TranslateIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: async () => {
                    const messages = MessageStore.getMessages(message.channel_id);
                    massTranslate((messages._array as Message[]).toReversed());
                },
            };
        });



        this.preSend = addPreSendListener(async (_, message) => {
            if (!settings.store.autoTranslate) return;
            if (!message.content) return;

            const translation = (await translate("sent", message.content)).text;

            message.content = `
${translation}
|>> ${message.content}
            `;
        });
    },



    stop() {
        removePreSendListener(this.preSend);
        removeChatBarButton("vc-translate");
        removeButton("vc-translate");
        removeAccessory("vc-translation");
    },
});

async function massTranslate(messageArr: Message[]) {
    for (let i = 0; i < messageArr.length; i++) {
        if (await handleTranslation(messageArr[i]) === false) // if not already translated
            await new Promise(r => setTimeout(r, 60));

    }
}

async function restoreCachedTranslations(messageArr: Message[]) {
    for (let i = 0; i < messageArr.length; i++) {
        const message = messageArr[i];
        const messageAlreadyTranslated = translatedMessages.has(message.id);
        if (messageAlreadyTranslated === true) {
            handleTranslate(message.id, translatedMessages.get(message.id)!);
        }
    }
}

async function handleTranslation(message: Message) {

    let trans: TranslationValue = { sourceLanguage: "", text: "" };
    const messageAlreadyTranslated = translatedMessages.has(message.id);
    if (messageAlreadyTranslated === false) {
        trans = await translate("received", message.content);
        translatedMessages.set(message.id, trans);
    } else {
        // console.log("message already translated");
        trans = translatedMessages.get(message.id)!;
    }

    if (trans.text !== "") handleTranslate(message.id, trans);

    return messageAlreadyTranslated;
}
