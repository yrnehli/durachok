import { CardSuits, shuffleArray } from "@durachok/engine/src";
import { GameSettings, LobbyInfo } from "@durachok/transport/src/request";
import { TRPCError } from "@trpc/server";
import { customAlphabet } from "nanoid";
import { Logger } from "pino";

import Lobbies, { PopulatedLobby } from "../models/lobby.model";
import { TokenPayload } from "../schemas/auth";
import { DBLobby, DBLobbySchema, DBPlayer } from "../schemas/lobby";
import { assert, isDef } from "../utils";
import { CommonService } from "./common";

export class LobbyService {
    public constructor(
        private readonly logger: Logger,
        private readonly commonService: CommonService,
    ) {}

    /** Generate a new game pin. */
    private async newGamePin(): Promise<string> {
        const alphabet = customAlphabet("1234567890", 6);
        let candidate = alphabet();

        // ##Hack: Very unlikely to happen, but just in case we have a collision.
        while (isDef(await Lobbies.findOne({ pin: candidate }))) {
            candidate = alphabet();
        }

        return candidate;
    }

    /** Generate a new game passphrase */
    private newGamePassphrase(): string {
        const suites = Object.values(CardSuits);
        shuffleArray(suites);
        return suites.join("");
    }

    /** Get an enriched Lobby object. */
    private async enrich(lobby: PopulatedLobby): Promise<DBLobby> {
        const result = await DBLobbySchema.safeParseAsync(lobby.toObject());

        if (result.success) {
            return result.data;
        }

        // @@Todo: add logging about why...
        this.logger.error("Failed to parse lobby:\n", result.error);
        throw new Error("Could not parse lobby");
    }

    /** Convert a lobby object into a lobby info object. */
    private lobbyIntoInfo(lobby: DBLobby): LobbyInfo {
        return {
            pin: lobby.pin,
            joinable:
                lobby.status === "waiting" &&
                lobby.players.length < lobby.maxPlayers,
            passphrase: isDef(lobby.passphrase),
            players: lobby.players.length,
            maxPlayers: lobby.maxPlayers,
            status: lobby.status,
        };
    }

    /** Get a lobby state. */
    public async getByPin(pin: string): Promise<DBLobby | undefined> {
        const game = await Lobbies.findOne({ pin })
            .populate<Pick<PopulatedLobby, "owner">>("owner")
            .exec();

        if (!isDef(game)) {
            return undefined;
        }

        return await this.enrich(game);
    }

    /** Check if a user has access to a lobby. */
    public async hasAccess(token: TokenPayload, pin: string): Promise<boolean> {
        if (token.kind === "registered") {
            return await this.isUserInLobby(pin, token.user.name);
        } else {
            // @@Todo: There is a potential problem, if a lobby pin is re-used within
            // the expiration time of the token, then the user could join the new
            // lobby without the owner's permission or without going through the standard
            // join process. Mitigation is to parametrise the token over the `id` of the
            // lobby which should be unique.
            return token.pin === pin;
        }
    }

    /** Check whether a user is within a lobby */
    public async isUserInLobby(
        pin: string,
        name: string,
        userId?: string,
    ): Promise<boolean> {
        return isDef(
            await Lobbies.findOne({
                pin,
                $or: [
                    { "players.name": name },
                    ...(userId ? [{ "players.registered": userId }] : []),
                ],
            }),
        );
    }

    /** Get basic information about a lobby. */
    public async getInfoByPin(pin: string): Promise<LobbyInfo | undefined> {
        const lobby = await this.getByPin(pin);
        if (!isDef(lobby)) {
            throw new TRPCError({ code: "NOT_FOUND" });
        }

        return this.lobbyIntoInfo(lobby);
    }

    /** Get all lobbies by a given user */
    public async getByOwner(userId: string): Promise<LobbyInfo[]> {
        const items = await Lobbies.find({ owner: userId }).populate<
            Pick<PopulatedLobby, "owner">
        >("owner");
        const lobbies = await Promise.all(items.map(this.enrich));
        return lobbies.map(this.lobbyIntoInfo);
    }

    /** Add a user to the current lobby. */
    public async addUserTo(pin: string, player: DBPlayer): Promise<void> {
        const lobby = await this.getByPin(pin);
        assert(isDef(lobby), "modifying non-existant lobby.");

        // find an un-honoured connection entry and overwrite it, otherwise we
        // can just append the connection
        if (lobby.players.length === lobby.maxPlayers) {
            const idx = lobby.players.findIndex((player) => !player.confirmed);
            lobby.players[idx] = player;
        } else {
            lobby.players.push(player);
        }

        // We need to update the lobby in the database.
        await Lobbies.updateOne(
            { pin },
            {
                $set: {
                    players: lobby.players,
                },
            },
        );
    }

    /**
     * Create a new lobby with the given `user` as the owner and the provided game settings.
     * */
    public async create(
        userId: string,
        settings: GameSettings,
    ): Promise<{ pin: string }> {
        const {
            maxPlayers,
            passphrase,
            shortGameDeck,
            freeForAll,
            disableChat,
            randomisePlayerOrder,
            roundTimeout,
        } = settings;

        const pin = await this.newGamePin();
        const owner = await this.commonService.getUserDbObject(userId);

        try {
            const ownerAsPlayer = {
                name: owner.name,
                socket: null,
                confirmed: true,
                registered: userId,
            };
            const lobby = new Lobbies({
                pin,
                maxPlayers,
                ...(passphrase ? { passphrase: this.newGamePassphrase() } : {}),
                shortGameDeck,
                freeForAll,
                disableChat,
                randomisePlayerOrder,
                roundTimeout,
                status: "waiting",
                // Automatically add the owner to the lobby.
                players: [ownerAsPlayer],
                owner: userId,
                chat: [],
            });

            await lobby.save();

            return {
                pin,
            };
        } catch (e: unknown) {
            this.logger.error("Failed to create lobby", e);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
    }

    /** Delete a lobby by PIN. */
    public async delete(pin: string): Promise<void> {
        try {
            await Lobbies.deleteOne({ pin });

            // @@Todo: socket events!
            // kick everyone from the lobby if any connections are present.
            // emitLobbyEvent(pin, ClientEvents.CLOSE, { reason: "lobby_closed" });
        } catch (e: unknown) {
            this.logger.error("Failed to delete lobby", e);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
    }
}
