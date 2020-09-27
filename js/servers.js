const nova_servers = {};

fetch("./data/serversList.json").then(res=>res.json()).then(async serversList=>{
    createServersListBlock(serversList);
    const servers_div = document.getElementById("servers");
    for (let i = 0; i < serversList.length; i++) {

        const checkboxBlock = cel(
            ['div', {className: 'servercheckbox'}, 
            ['input', {type: 'checkbox', checked: !params["hideplayers"]}],
            ['span', {innerText: serversList[i][1]}],
            isMobileDevice === false ? ['a', {href: 'fivem://connect/' + serversList[i][0], title: 'Join: ' + serversList[i][0], innerText: '🎮'}] : []
        ]);

        servers_div.appendChild(checkboxBlock);

        nova_servers[serversList[i][0]] = {
            name: serversList[i][1],
            ip: serversList[i][0],
            players: {},
            timestamp: 0,
            checkbox: checkboxBlock.firstElementChild,
            disabled: true,
            timeout: null
        };

        nova_servers[serversList[i][0]].checkbox.addEventListener("change", () => {
            if(nova_servers[serversList[i][0]].disabled){
                enable_server(nova_servers[serversList[i][0]]);
            }else{
                disable_server(nova_servers[serversList[i][0]]);
            }
        })
    };

    if(!params["hideplayers"]){
        //scan servers via keyless api for disabled servers or servers with 0 player count;
        for (const server_id in nova_servers) {
            fetch(`http://${nova_servers[server_id].ip}/status/widget/players.json`).then(res=>res.json()).then(res=>{
                if(res && res.players && res.players.length > 0){
                    enable_server(nova_servers[server_id])
                }else{
                    disable_server(nova_servers[server_id]);
                }
            }).catch(err=>{
                // console.log(err)
                disable_server(nova_servers[server_id]);
            });
        }
    }
}).catch(err=>{
    console.log(err);
})

function get_server_data(server){
    if(server.disabled === true) return;
    fetch("https://novaplus.herokuapp.com/positions/" + server.ip).then(res=>res.json()).then(res => {
        if(!res.data || res.error || res.data.players.length === 0) {
            console.log(res.error ? res.error : "no res data / no players");
            disable_server(server);
            return;
        }

        const timestamp = Date.now();
        const delta_time = server.timestamp === 0 ? 0 : timestamp - server.timestamp;
        server.timestamp = timestamp;
        const players = res.data.players;

        for (let i = 0; i < players.length; i++) {
            if(players[i][3] === null) continue;

            const player_id = players[i][2];

            if(players[i][0] === "null"){
                if(server.players[player_id] !== undefined){
                    map.removeLayer(server.players[player_id].marker)
                    delete server.players[player_id];
                }
                continue;
            }

            if(server.players[player_id] === undefined){
                const gameid = players[i][0]+"#"+player_id;
                const color = randomColor2();
                server.players[player_id] = {
                    marker: L.marker(
                                [players[i][3].y, players[i][3].x],
                                {icon: generate_icon(players[i][4], players[i][5], 40)})
                            .addTo(map)
                            .bindPopup(generate_popup(players[i], server, color))
                            .bindTooltip(generate_tag(players[i][5]["group"], gameid), {
                                permanent: false,
                                offset: [0, -5],
                                opacity: 0.8,
                                direction: "top"
                            }),
                    polyline: undefined,
                    gameid,
                    timestamp,
                    vehicle: players[i][4],
                    job: players[i][5],
                    positions: [{ lat: players[i][3].y, lng: players[i][3].x }],
                    color
                }

                server.players[player_id].marker.setZIndexOffset(1000);

            }else{
                //TRAILS
                if(currentTrailMode !== 2){

                    //if player teleported, clear the positions array
                    const lastPos = server.players[player_id].positions[server.players[player_id].positions.length-1];
                    if(lastPos){
                        const magnitude = Math.abs((lastPos.lng - players[i][3].x) + (lastPos.lat - players[i][3].y));
                        if( (6000/delta_time) * magnitude > 800 ){
                            server.players[player_id].positions.length = 0;
                        }
                    }

                    server.players[player_id].positions.push({ lat: players[i][3].y, lng: players[i][3].x });

                    //if current trail mode is 0 (short) limit the positions to 5, else its long, limit is 100
                    while (server.players[player_id].positions.length > (currentTrailMode === 0 ? 5 : 100)){
                        server.players[player_id].positions.shift();
                    }
                }else{ //if trail mode none, clear positions
                    server.players[player_id].positions.length = 0;
                }

                if(server.players[player_id].polyline !== undefined){
                    map.removeLayer(server.players[player_id].polyline);
                }

                if(server.players[player_id].positions.length > 1){
                    server.players[player_id].polyline = L.polyline(server.players[player_id].positions, {
                        color: server.players[player_id].color,
                        weight: 2
                    }).addTo(map);
                }

                server.players[player_id].timestamp = timestamp;

                // DATA - MARKER
                server.players[player_id].marker.setLatLng({ lat: players[i][3].y, lng: players[i][3].x });

                // POPUP UPDATE
                let refresh_popup = false;

                if(server.players[player_id].vehicle["vehicle_model"] !== players[i][4]["vehicle_model"]){
                    server.players[player_id].marker.setIcon( generate_icon(players[i][4], players[i][5]) );
                    server.players[player_id].vehicle = players[i][4];
                    refresh_popup = true;
                }

                if(server.players[player_id].job["name"] !== players[i][5]["name"]){
                    server.players[player_id].marker._tooltip.setContent( generate_tag(players[i][5]["group"], server.players[player_id].gameid) )
                    server.players[player_id].job = players[i][5];
                    refresh_popup = true;
                }

                if(refresh_popup || players[i][4]["vehicle_type"] === "plane" || players[i][4]["vehicle_type"] === "helicopter"){
                    server.players[player_id].marker.setPopupContent( generate_popup(players[i], server, server.players[player_id].color) );
                }
            }
        }

        // console.log("finished fetching | delta time: " + delta_time)
        server_cleanup(server);

        if(!server.timeout){
            server.timeout = setTimeout(() => {
                get_server_data(server);
                server.timeout = null;
            }, 6000);
        }

    }).catch(err=>{
        // console.log(err);
        disable_server(server);
    });
}

function disable_server(server){
    server.checkbox.checked = false;
    server.disabled = true;
    if(server.timeout){
        clearTimeout(server.timeout);
        server.timeout = null;
    }
    server_cleanup(server, true);
}

function enable_server(server){
    server.checkbox.checked = true;
    server.disabled = false;
    if(!server.timeout){
        get_server_data(server);
    }
}

function servers_check_all(){
    for (const server_id in nova_servers) {
        if(nova_servers[server_id].disabled){
            enable_server(nova_servers[server_id]);
        }
    }
}

function servers_uncheck_all(){
    for (const server_id in nova_servers) {
        if(!nova_servers[server_id].disabled){
            disable_server(nova_servers[server_id]);
        }
    }
}

function server_cleanup(server, force_cleanup = false){
    for(const player_id in server.players){ //clean up players that left
        if(force_cleanup || server.players[player_id].timestamp < Date.now() - 49000){
            map.removeLayer(server.players[player_id].marker)
            if(server.players[player_id].polyline) map.removeLayer(server.players[player_id].polyline);
            delete server.players[player_id];
        }
    }
}

function generate_popup(data, server, color){
    return `<div class="markerHead" ${color ? `style="background-color: ${color}"` : ""}>Player Info</div>
        <b>Name:</b> ${data[0]}<hr>
        <b>ID:</b> ${data[2]}<hr>
        <b>Color:</b> <div style="backgroud-color: ${color}; width:50px;"></div><hr>
        <b>Job:</b> ${data[5].name || "N/A"}<hr>
        <b>Vehicle</b>: ${(data[4]["vehicle_label"] === "NULL"? "N/A" : 
                        `${data[4]["vehicle_name"]} (${vehicle_classes[data[4]["vehicle_class"]]})`)}<hr>
        ${data[4]["vehicle_type"] === "plane" || data[4]["vehicle_type"] === "helicopter" ? `<b>Height</b>: ${parseInt(data[3]['z'])}<hr>` : ''}
        
        <b>${server.name}</b> <a href="fivem://connect/${server.ip}" title="Join: ${server.name}">JOIN</a>`;
}

function generate_tag(job, player_id){
    return job_icons[job] === undefined ? player_id : job_icons[job] + player_id;
}