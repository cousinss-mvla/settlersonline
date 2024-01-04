import { getClient } from "./settings.js";

const client = getClient();
// const sessionDisconnectLifetimeSeconds = 5; //should be like 3600 for production

let sessionID;
let gameCode;
let myProfile;
let amLeader;
let players;

let createdServer = false;

//math consts
const SQRT_3 = Math.sqrt(3);
const HALF_SQRT_3 = SQRT_3 / 2;

class Player {
    constructor(id, name, color, isBot, isLeader, isMe) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.isBot = isBot;
        this.isLeader = isLeader;
        this.isMe = isMe;
    }
}

function getCookie(cname) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

// function attemptReconnect() {
    // let id = getCookie("id");
    // let name = getCookie("name");
    // console.log("Attempted reconnect, got id \"" + id + "\", name \"" + name + "\"");
    // if(id === "" || name === "") {
    //     console.log("Reconnect failed. Prompting new user session.")
    //     return;
    // }
    // client.publish({
    //     destination: "/app/reconnect",
    //     body: JSON.stringify({'name': name, 'id': id})
    // });
    // console.log("Recovered disconnected session with id \"" + id + "\", name \"" + name + "\"");
    // document.getElementById("name-input").style.display = 'none';
    // document.getElementById("reconnect-alert").style.display = 'block';
// }

client.onConnect = (frame) => { //bp DNR
    console.log('Connected: ' + frame);
    subscribeMessageHandlers();
};

client.onDisconnect = (frame) => {
    console.log("Disconnected: " + frame);
}

client.onWebSocketError = (error) => { //bp DNR
    console.error('Error with websocket', error);
};

client.onStompError = (frame) => { //bp DNR
    console.error('Broker reported error: ' + frame.headers['message']);
    console.error('Additional details: ' + frame.body);
};

function connectToGameServer(name, gameCode, leader) {
    client.reconnectDelay = 5000;
    client.onConnect = (frame) => {
        console.log("Connected " + frame);
        subscribeMessageHandlers();
        client.publish({
            destination: '/topic/connect',
            body: JSON.stringify({
                profile: {
                    ID: getCookie("sessionID"),
                    type: "HUMAN",
                    name: name,
                    color: "GREEN",
                    isLeader: leader
                },
                gameCode: gameCode
            })
        });
    }
    client.activate();
}

$(document).ready(function() {
    console.log('Docu');
    $('#play-button').click(function() {
        console.log("CLICKED PLAY");
        connectToGameServer($("#name").val(), $("#joinCode").val().toUpperCase(), false);
    });
    $('#create-game').click(createAndConnectServer);
    $('#bot-add').click(function() {addBot("ADD")});
    $('#bot-remove').click(function() {addBot("REMOVE")});
    $('#game-start-button').click(startGame);
});

function addBot(botChangeType) {
    $.post("/queue/game/" + gameCode + "/addBot", {postType: botChangeType});
}

async function createAndConnectServer() {
    if(createdServer) {
        return;
    }
    createdServer = true;
    console.log("CLICKED CREATE");
    const codeResponse = await fetch("/queue/create-server");
    console.log(codeResponse);
    let code = (await codeResponse.json())[0];
    console.log(code);
    connectToGameServer($("#name").val(), code, true);
}

function putCookie(k, v, lifetimeSeconds) {
    var now = new Date();
    var time = now.getTime();
    var expireTime = time + 1000*lifetimeSeconds;
    now.setTime(expireTime);
    document.cookie = k + "=" + v + ";expires="+now.toUTCString()+";SameSite=Lax;path=/";
}

// function receiveSession(sessionMessage) {
//     console.log("Connected with ID: " + JSON.parse(sessionMessage.body).id);
//     let msg = JSON.parse(sessionMessage.body);
//     let id = msg.id;
//     let name = msg.name;
//     let reconnected = msg.reconnected;
//     sessionID = id;
//     sessionName = name;
//     putCookie("name", name, sessionDisconnectLifetimeSeconds)
//     putCookie("id", id, sessionDisconnectLifetimeSeconds)
//     document.getElementById("id-title-banner").innerHTML = "\"" + name + "\" (#" + id + ")";
//     console.log("Reconnected: " + reconnected);
// }

function subscribeMessageHandlers() { //will keep as BP but edit within
    client.subscribe('/user/queue/joingameserver', recieveServerJoin);
}

function recieveServerJoin(payload) {
    console.log(JSON.parse(payload.body));
    myProfile = JSON.parse(payload.body).profile;
    sessionID = myProfile.ID;
    amLeader = myProfile.isLeader;
    gameCode = JSON.parse(payload.body).gameCode;
    console.log("id = " + sessionID);
    if(JSON.parse(payload.body).result === "BAD_CODE") {
        console.log("BAD_CODE > deactivate")
        $("#invalid-code").show();
        client.deactivate();
        return;
    }
    $('#join-input').fadeOut();
    $('#game-lobby').fadeIn();
    //else TODO handle reconnect (diff)
    playerConnectToServer();
    client.subscribe('/queue/game/' + gameCode + '/playerconnect', playerConnectToServer);
    client.subscribe('/queue/game/' + gameCode + '/gamestart', joinGame);
}

function playerConnectToServer() {
    updatePlayerList().then();
}

async function updatePlayerList() {
    $('#game-lobby-code').text('Join with code: ' + gameCode);
    const playersResponse = await fetch('/queue/game/' + gameCode + '/getPlayers');
    console.log(playersResponse);
    let playerList = await playersResponse.json();
    console.log(players);
    $('#connected-players').empty();
    players = [];
    playerList.sort().forEach(pl => {
        console.log(pl);
        let color = pl.color;
        let name = pl.name;
        let isBot = pl.type === "ROBOT";
        let isLeader = pl.isLeader;
        let playerID = pl.ID;
        let isMe = playerID === sessionID;
        if(isMe) {
            myProfile = pl;
            amLeader = isLeader;
        }
        players.push(new Player(playerID, name, color, isBot, isLeader, isMe));
        $('#connected-players').append("<div class='connected-player'>" + (isLeader ? "&#9733;" : "") + name + (isMe ? " (You)" : "") + (isBot ? " (BOT)" : "") + "</div>");
    })
    let numConnected = players.length;
    if(amLeader) {
        $("#bot-panel").show();
        if(numConnected >= 3) {
            $("#game-start-button").fadeIn();
            $("#waiting-for-players").hide();
        } else {
            $("#game-start-button").hide();
            $("#waiting-for-players").show();
        }
    } else {
        $("#bot-panel").hide();
    }
    $('#num-connected').html('Connected (' + numConnected + '/' + (numConnected > 4 ? 6 : 4) + ')');
}

function startGame() {
    $.post("/queue/game/" + gameCode + "/start");
}

function sendToGamePage() {
    $('#lobby-page').hide();
    $('#game-page').show();
    $('body').css("background","#a66f3f");
}

async function joinGame(message) {
    sendToGamePage();
    const body = JSON.parse(message.body);
    const scenario = body.scenario;
    console.log("Recieved gamestart from " + body.gameCode + ":");
    const tilemap = body.tileMap;
    let tiles = $('#tiles');
    const size = scenario === "THREE_FOUR" ? 10 : 8;
    const sizeBuffer = 1.1;
    tiles.empty();
    for(const [coordinateString, tile] of Object.entries(tilemap)) {
        const coordinate = parseCoordinate(coordinateString);
        const q = coordinate.q;
        const r = coordinate.r;
        const x = (sizeBuffer * (q*size + r*size/2)) - size/2;
        const y = sizeBuffer * (r*size*HALF_SQRT_3) - size;
        tiles.append("<div class='tile' style=" +
            "'width: " + size + "vh;height: " + 2*size + "vh; transform: translate(" + x + "vh, " + y + "vh) rotate(120deg) ;'" +
            "><div class='tile-in1'><div class='tile-in2' style='background-image: url(" + toTileImage(tile.resource) + ")'></div></div></div>");
    } //TODO need to set up buttons on each of the vertices and edges. should probably store tilemap locally
}

function toTileImage(resource) {
    if(resource == null) {
        return "\"images/tile/desert.png\"";
    }
    return "\"images/tile/" + resource.toLowerCase() + ".png\"";
}

function parseCoordinate(coordinateString) {
    const parts = /^\((.+),(.+)\)$/.exec(coordinateString);
    let matches = parts.slice(1).map((p) => parseInt(p, 10));
    return {
        q: matches[0],
        r: matches[1]
    };
}