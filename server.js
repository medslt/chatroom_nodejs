/*
* By: Mohamed salamat
* @ : mohamed8salamat@gmail.com
* github: medslt
* 05/2015
**/

var express = require('express')
, app = express()
, server = require('http').createServer(app)
, io = require("socket.io").listen(server)
, npid = require("npid")
, uuid = require('node-uuid')/*creer des identifiants  uniques pour les rooms de chat*/
, Room = require('./room.js')
, _ = require('underscore')._;

app.configure(function() {
	app.set('port', process.env.OPENSHIFT_NODEJS_PORT || 3000);
  	app.set('ipaddr', process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1");
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.static(__dirname + '/public'));
	app.use('/components', express.static(__dirname + '/components'));
	app.use('/js', express.static(__dirname + '/js'));
	app.use('/icons', express.static(__dirname + '/icons'));
	app.set('views', __dirname + '/views');
	app.engine('html', require('ejs').renderFile);

	/* Store process-id (as priviledged user) */
	try {
	    npid.create('/var/run/advanced-chat.pid', true);
	} catch (err) {
	    console.log(err);
	    process.exit(1);
	}

});

app.get('/', function(req, res) {
  res.render('index.html');
});

server.listen(app.get('port'), app.get('ipaddr'), function(){
	console.log('Express server listening on  IP: ' + app.get('ipaddr') + ' and port ' + app.get('port'));
});

io.set("log level", 1);
var people = {};
var rooms = {};
var sockets = [];
var chatHistory = {};

function purge(s, action) {
	/*
	cette fonction permet :
	 1- à un utilisateur de  quitter un chatroom
	 2- ou supprimer un chatroom
	
	*/
	if (people[s.id].inroom) { //l'utilisateur appertient à un chatroom
		var room = rooms[people[s.id].inroom]; //recupérer ce chatroom.
		if (s.id === room.owner) { //vérifier si il est  le propriétaire de ce chatroom
			if (action === "disconnect") {
				io.sockets.in(s.room).emit("update", "L'admin (" +people[s.id].name + ") s'est déconnecté du serveur. Ce chatroom est supprimé et vous vous etes déconnecté.");
				var socketids = [];
				for (var i=0; i<sockets.length; i++) {
					socketids.push(sockets[i].id);
					if(_.contains((socketids)), room.people) {
						sockets[i].leave(room.name);
					}
				}

				if(_.contains((room.people)), s.id) {
					for (var i=0; i<room.people.length; i++) {
						people[room.people[i]].inroom = null;
					}
				}
				room.people = _.without(room.people, s.id); //Supprimer les user de ce chatroom
				delete rooms[people[s.id].owns]; //supprimer le chatroom
				delete people[s.id]; //supprimer le user
				delete chatHistory[room.name]; //supprimer l'historiquehistorique du chatroom
				sizePeople = _.size(people);
				sizeRooms = _.size(rooms);
				io.sockets.emit("update-people", {people: people, count: sizePeople});
				io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
				var o = _.findWhere(sockets, {'id': s.id});
				sockets = _.without(sockets, o);
			} else if (action === "removeRoom") { //supprimer un chatroom
				io.sockets.in(s.room).emit("update", "L'admin (" +people[s.id].name + ") a supprimé ce chatroom. Vous êtes déconnecté.");
				var socketids = [];
				for (var i=0; i<sockets.length; i++) {
					socketids.push(sockets[i].id);
					if(_.contains((socketids)), room.people) {
						sockets[i].leave(room.name);
					}
				}

				if(_.contains((room.people)), s.id) {
					for (var i=0; i<room.people.length; i++) {
						people[room.people[i]].inroom = null;
					}
				}
				delete rooms[people[s.id].owns];
				people[s.id].owns = null;
				room.people = _.without(room.people, s.id); //supprimer les user de ce chatroom
				delete chatHistory[room.name]; //supprimer l'héstory du chatroom
				sizeRooms = _.size(rooms);
				io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
			} else if (action === "leaveRoom") { //l'admin quitte le chatroom
				io.sockets.in(s.room).emit("update", "L'admin (" +people[s.id].name + ") s'est déconnecté. Ce chatroom est supprimé et vous êtes déconnecté.");
				var socketids = [];
				for (var i=0; i<sockets.length; i++) {
					socketids.push(sockets[i].id);
					if(_.contains((socketids)), room.people) {
						sockets[i].leave(room.name);
					}
				}

				if(_.contains((room.people)), s.id) {
					for (var i=0; i<room.people.length; i++) {
						people[room.people[i]].inroom = null;
					}
				}
				delete rooms[people[s.id].owns];
				people[s.id].owns = null;
				room.people = _.without(room.people, s.id); //supprimer les user de ce chatroom
				delete chatHistory[room.name]; //supprimer l'héstory du chatroom
				sizeRooms = _.size(rooms);
				io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
			}
		} else {//user qui n'est pas l'admin
			if (action === "disconnect") {
				io.sockets.emit("update", people[s.id].name + " s'est déconnecté du serveur.");
				if (_.contains((room.people), s.id)) {
					var personIndex = room.people.indexOf(s.id);
					room.people.splice(personIndex, 1);
					s.leave(room.name);
				}
				delete people[s.id];
				sizePeople = _.size(people);
				io.sockets.emit("update-people", {people: people, count: sizePeople});
				var o = _.findWhere(sockets, {'id': s.id});
				sockets = _.without(sockets, o);
			} else if (action === "removeRoom") {
				s.emit("update", "Vous ne poouvez pas supprimer ce chatroom, vous n'êstes pas admin.");
			} else if (action === "leaveRoom") {
				if (_.contains((room.people), s.id)) {
					var personIndex = room.people.indexOf(s.id);
					room.people.splice(personIndex, 1);
					people[s.id].inroom = null;
					io.sockets.emit("update", people[s.id].name + " a quitté le chatroom.");
					s.leave(room.name);
				}
			}
		}	
	} else {
		
		if (action === "disconnect") {
			io.sockets.emit("update", people[s.id].name + " s'est déconnecté du serveur.");
			delete people[s.id];
			sizePeople = _.size(people);
			io.sockets.emit("update-people", {people: people, count: sizePeople});
			var o = _.findWhere(sockets, {'id': s.id});
			sockets = _.without(sockets, o);
		}		
	}
}

io.sockets.on("connection", function (socket) {
	//connexion d'un nouveau utilisateur
	socket.on("joinserver", function(name, device) {
		var exists = false;
		var ownerRoomID = inRoomID = null;

		_.find(people, function(key,value) {//un fonction underscor.js qui permet de parcourir un tableau
			if (key.name.toLowerCase() === name.toLowerCase())
				return exists = true;
		});
		if (exists) {//Si le username existe, proposer un autre username
			var randomNumber=Math.floor(Math.random()*1001)
			do {
				proposedName = name+randomNumber;
				_.find(people, function(key,value) {//chercher un nouveau username qui n'existe pas pour le proposer à l'utilisateur
					if (key.name.toLowerCase() === proposedName.toLowerCase())
						return exists = true;
				});
			} while (!exists);
			socket.emit("exists", {msg: "Ce nom dèja existe, veuillez entrer un autre nom SVP.", proposedName: proposedName});
		} else {// Ajouter le nouvel utilisateur
			/*
				On sauvegarde les donées suivantes pour chaque utilisateur : 
				name : son username;
				"owns" : s'il a créé une chatroom ou pas
				inroom : l'id de room si'il est connecté dans une chatroom
				device : le type de device (desktop, mobile)
			*/

			people[socket.id] = {"name" : name, "owns" : ownerRoomID, "inroom": inRoomID, "device": device};
			socket.emit("update", "Vous êtes connecté au serveur.");
			//informer tout les utilisateurs qu'il y un nouveau membre vient de connecter
			io.sockets.emit("update", people[socket.id].name + " est en ligne.")
			sizePeople = _.size(people);
			sizeRooms = _.size(rooms);
			//mettre à jour les nombre d'utilisateurs et les chatroom affichés  
			io.sockets.emit("update-people", {people: people, count: sizePeople});
			socket.emit("roomList", {rooms: rooms, count: sizeRooms});

			//demander les cordonnées gps de l'utilisateur pour le localiser(voir la fonction positionSuccess() dans client.js).
			socket.emit("joined"); 

			//sauvegarder l'objet socket du nouvel utilisateur
			sockets.push(socket);
		}
	});

	/* socket.on("getOnlinePeople", function(fn) {
                fn({people: people});
        });*/

	socket.on("countryUpdate", function(data) { //sauvegarder les coordonnées de client (pays)
		country = data.country.toLowerCase();
		people[socket.id].country = country;
		//envoyer aux usitilisateurs les nouvelle listes avec les coordonnées à jour
		io.sockets.emit("update-people", {people: people, count: sizePeople});
	});

	//un utilisateur est entrain d'ecrire ;)
	socket.on("typing", function(data) {
		if (typeof people[socket.id] !== "undefined")
			io.sockets.in(socket.room).emit("isTyping", {isTyping: data, person: people[socket.id].name});
	});
	
	socket.on("send", function(msTime, msg) {
		//process.exit(1);
		var re = /^[w]:.*:/;//une expression régulière pour tester si le chat est privé  
		var private = re.test(msg);
		var privateStr = msg.split(":");
		var found = false;
		if (private) { // chat privé
			var privateTo = privateStr[1];
			var keys = Object.keys(people);
			if (keys.length != 0) {
				for (var i = 0; i<keys.length; i++) {
					if (people[keys[i]].name === privateTo) {
						var privateId = keys[i];
						found = true;
						if (socket.id === privateId) { //on ne peut pas envoyer un msg privé à sois meme
							socket.emit("update", "Vous ne pouvez pas chater en privé avec vous meme ;)");
						}
						break;
					} 
				}
			}
			if (found && socket.id !== privateId) {
				var privateTo = privateStr[1];
				var privateMsg = privateStr[2];
				socket.emit("private",msTime, {name: "You"}, privateMsg);
				io.sockets.socket(privateId).emit("private", msTime, people[socket.id], privateMsg);
			} else {
				socket.emit("update",  privateTo + "n'est pas trouvé :( " );
			}
		} else {
				//tester si l'utilisateur apartient à une chatroom
			if (io.sockets.manager.roomClients[socket.id]['/'+socket.room] !== undefined ) {
				io.sockets.in(socket.room).emit("chat", msTime, people[socket.id], msg);
				socket.emit("isTyping", false);
				if (_.size(chatHistory[socket.room]) > 10) {
					chatHistory[socket.room].splice(0,1);
				} else {
					chatHistory[socket.room].push(people[socket.id].name + ": " + msg);
				}
		    	} else {
				socket.emit("update", "veuillez vous connecter à une chatroom SVP.");
		    	}
		}
	});

	socket.on("disconnect", function() {
		if (typeof people[socket.id] !== "undefined") { //un client vient de se déconnecter 
			purge(socket, "disconnect");
		}
	});

	/*
	 Fonctions pour gérer les chatrooms
	*/ 

	//création d'une chatroom
	socket.on("createRoom", function(name) {
		if (people[socket.id].inroom) {
			socket.emit("update", "Vous êtes deja connecté à une chatroom. Veuillez vous déconnecter pour pouvoir créer une nouvelle chatroom.");
		} else if (!people[socket.id].owns) {//tester si le client n'a pas eu dèjà créé une chatroom
			var id = uuid.v4();
			var room = new Room(name, id, socket.id);
			rooms[id] = room;
			sizeRooms = _.size(rooms);
			io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
			//add room to socket, and auto join the creator of the room
			socket.room = name;
			socket.join(socket.room);
			people[socket.id].owns = id;
			people[socket.id].inroom = id;
			room.addPerson(socket.id);
			socket.emit("update", "Bienvenue dans :" + room.name + ".");
			socket.emit("sendRoomID", {id: id});
			chatHistory[socket.room] = [];
		} else {
			socket.emit("update", "Vous avez déjà créé un chatroom.");
		}
	});

	socket.on("check", function(name, fn) {
		var match = false;
		_.find(rooms, function(key,value) {
			if (key.name === name)
				return match = true;
		});
		fn({result: match});
	});

	socket.on("removeRoom", function(id) {
		 var room = rooms[id];
		 if (socket.id === room.owner) {
			purge(socket, "removeRoom");
		} else {
                	socket.emit("update", "Vous ne pouvez pas supprimer ce chatroom, vous n'êtes pas un admin.");
		}
	});

	socket.on("joinRoom", function(id) {
		if (typeof people[socket.id] !== "undefined") {
			var room = rooms[id];
			if (socket.id === room.owner) {
				socket.emit("update", "Vous êtes l'admin de ce chatroom, vous êtes déjà ajouté.");
			} else {
				if (_.contains((room.people), socket.id)) {
					socket.emit("update", "Vous êtes déjà connecté à ce chatroom.");
				} else {
					if (people[socket.id].inroom !== null) {
				    		socket.emit("update", "Vous êtes déjà connecté à ce chatroom ("+rooms[people[socket.id].inroom].name+"), SVP deconnectez-vous pour pouvoir vous connecter à un autre chatroom.");
				    	} else {
						room.addPerson(socket.id);
						people[socket.id].inroom = id;
						socket.room = room.name;
						socket.join(socket.room);
						user = people[socket.id];
						io.sockets.in(socket.room).emit("update", user.name + " s'est connecté au chatroom : " + room.name + ".");
						socket.emit("update", "Bienvenue dans : " + room.name + ".");
						socket.emit("sendRoomID", {id: id});
						var keys = _.keys(chatHistory);
						if (_.contains(keys, socket.room)) {
							socket.emit("history", chatHistory[socket.room]);
						}
					}
				}
			}
		} else {
			socket.emit("update", "Veuillez entrer un nom valide SVP.");
		}
	});

	socket.on("leaveRoom", function(id) {
		var room = rooms[id];
		if (room)
			purge(socket, "leaveRoom");
	});
});
