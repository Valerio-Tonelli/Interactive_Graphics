import * as THREE from 'three';
import { AnimalSystem } from './AnimalSystem.js';

class PlanetaryExplorer {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Configurazione renderer per ombre e qualità
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x87CEEB);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;
        
        document.getElementById('gameContainer').appendChild(this.renderer.domElement);
        
        // Sistema temporale per ciclo giorno-notte
        this.timeSystem = {
            currentTime: 12.0,
            timeSpeed: 0.01,
            sunPosition: new THREE.Vector3(),
            moonPosition: new THREE.Vector3()
        };
        
        // Sistema del giocatore
        this.player = {
            position: new THREE.Vector3(0, 10, 0),
            velocity: new THREE.Vector3(),
            onGround: false,
            moveSpeed: 0.3,
            jumpForce: 0.5,
            resources: 0
        };
        
        // Sistema meteo
        this.weatherSystem = {
            isRaining: false,
            rainIntensity: 0.0,
            targetRainIntensity: 0.0,
            rainParticles: null,
            rainGeometry: null,
            rainMaterial: null,
            puddles: [],
            maxPuddles: 20,
            puddleLifetime: 300,
            puddleSlopeThreshold: 0.15,
            windStrength: 0.0
        };
        
        // Sistema vento
        this.windSystem = {
            enabled: false,
            direction: new THREE.Vector3(1, 0, 0.5).normalize(),
            strength: 0.3,
            
            patterns: {
                calm: { strength: 0.1},
                gentle: { strength: 0.3 },
                moderate: { strength: 0.8 },
                strong: { strength: 1.3 },
                storm: { strength: 2.5 }
            },
            currentPattern: 'gentle',
            
        };
        
        // Controlli input
        this.keys = {};
        this.mouse = { x: 0, y: 0, sensitivity: 0.002 };
        this.camera.rotation.order = 'YXZ';
        
        // Array per vegetazione animata
        this.vegetation = [];
        this.resources = [];
        this.animalSystem = null;
        
        // Contatore frame per UI updates
        this.frameCount = 0;
        
        this.init();
    }
    
    init() {
        this.createTerrain();
        this.createLighting();
        this.createSkybox();
        this.createVegetation();
        this.createWeatherSystem();
        this.createResources();
        this.setupControls();
        this.setupWeatherControls();
        this.initAnimalSystem();
        this.setupAnimalEvents();
        this.createAnimalUI();
        this.animate();
        this.updatePlayerPosition();
    }

    // =============================================
    // SISTEMA VENTO
    // =============================================

    updateWindSystem() {
        if (!this.windSystem.enabled) return;
        
        const time = Date.now() * 0.001;
        
        // Aggiorna effetti del vento
        this.updateWindEffects(this.windSystem.strength, time);
        
        // Aggiorna UI
        this.updateWindUI(this.windSystem.strength);
    }


    updateWindEffects(totalWindStrength, time) {
        // Aggiorna weatherSystem per compatibilità
        this.weatherSystem.windStrength = totalWindStrength;
        
        // Effetto del vento sulla pioggia (se attiva)
        if (this.weatherSystem.rainParticles && this.weatherSystem.rainIntensity > 0) {
            this.updateRainWithWind(totalWindStrength, time);
        }

        // Effetto del vento sulla vegetazione
        this.updateVegetationAnimation(totalWindStrength, time);
    }

    updateRainWithWind(totalWindStrength, time) {
        const rainPositions = this.weatherSystem.rainGeometry.attributes.position.array;
        const rainVelocities = this.weatherSystem.rainGeometry.attributes.velocity.array;
        
        for (let i = 0; i < rainPositions.length; i += 3) {
            const particleIndex = i / 3;
            
            const windEffect = totalWindStrength * (0.8 + Math.sin(time + particleIndex * 0.1) * 0.4);
            
            rainVelocities[i] = this.windSystem.direction.x * windEffect;
            rainVelocities[i + 2] = this.windSystem.direction.z * windEffect;
            
            rainVelocities[i + 1] = -0.5 - Math.random() * 0.5 - (totalWindStrength * 0.1);
        }
    }

    // Controlli vento
    setWindPattern(patternName) {
        if (this.windSystem.patterns[patternName]) {
            this.windSystem.currentPattern = patternName;
            
            console.log(`💨 Wind pattern set to: ${patternName}`);
            this.updateWindUI();
        }
    }

    setWindDirection(x, z) {
        this.windSystem.direction.set(x, 0, z).normalize();
        console.log(`💨 Wind direction set to: (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }

    toggleWind() {
        this.windSystem.enabled = !this.windSystem.enabled;
        
        console.log(`💨 Wind system ${this.windSystem.enabled ? 'enabled' : 'disabled'}`);
        this.updateWindUI();
        return this.windSystem.enabled;
    }

    updateWindUI(windStrength) {
        const windStatus = document.getElementById('windStatus');
        if (windStatus) {
            if (!this.windSystem.enabled) {
                windStatus.textContent = 'No Wind';
            } else {
                const totalStrength = windStrength || this.windSystem.strength;
                if (totalStrength < 0.1) {
                    windStatus.textContent = 'Calm';
                } else if (totalStrength < 0.3) {
                    windStatus.textContent = 'Light Breeze';
                } else if (totalStrength < 0.8) {
                    windStatus.textContent = 'Moderate Wind';
                } else if (totalStrength < 1.3) {
                    windStatus.textContent = 'Strong Wind';
                } else {
                    windStatus.textContent = 'Storm';
                }
            }
        }
        
        const windPattern = document.getElementById('windPattern');
        if (windPattern) {
            windPattern.textContent = this.windSystem.currentPattern;
        }
    }

    updateVegetationAnimation(totalWindStrength, time) {
        this.vegetation.forEach((tree, index) => {
            // Intensità vento dinamica
            const windStrength = totalWindStrength * (0.8 + Math.sin(time * 0.2 + index) * 0.4);
            const windSpeed = 1.5 + totalWindStrength * 2;

            const windOffset = tree.windOffset + time * windSpeed;
            
            // Direzione del vento applicata
            const windDirectionX = this.windSystem.direction.x * windStrength;
            const windDirectionZ = this.windSystem.direction.z * windStrength;
            
            // Oscillazione naturale + vento direzionale
            const naturalSwayX = Math.sin(windOffset) * 0.2;
            const naturalSwayZ = Math.cos(windOffset * 0.7) * 0.15;
            
            const totalSwayX = naturalSwayX + windDirectionX;
            const totalSwayZ = naturalSwayZ + windDirectionZ;

            // Applica movimento alla corona
            tree.crown.position.x = tree.basePosition.x + totalSwayX * 0.4;
            tree.crown.position.z = tree.basePosition.z + totalSwayZ * 0.4;
            tree.crown.rotation.x = totalSwayX * 0.15;
            tree.crown.rotation.z = totalSwayZ * 0.15;
            
            // Movimento del tronco (più sottile)
            tree.trunk.rotation.x = totalSwayX * 0.04;
            tree.trunk.rotation.z = totalSwayZ * 0.04;
            
        });
    }

    initAnimalSystem() {
        this.animalSystem = new AnimalSystem(
            this.scene,
            (x, z) => this.getHeightAtPosition(x, z),
            (x, z) => this.getSlope(x, z),
            (x, z) => this.findFlatGround(x, z),
            this.player.position,
            this.vegetation
        );
        
        console.log('🦌 Animal system ready!');
    }

    createAnimalUI() {
        const animalControls = document.createElement('div');
        animalControls.id = 'animalControls';
        animalControls.innerHTML = `
            <div style="position: absolute; top: 170px; left: 20px; color: white; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 10px; font-size: 14px; z-index: 100;">
                <strong>🦌 Animal Controls:</strong><br>
                <button class="animal-button" onclick="game.spawnRandomAnimal()">Spawn Animal (O)</button><br>
                <button class="animal-button" onclick="game.toggleAnimalSystem()">Toggle System (I)</button><br>
                <button class="animal-button" onclick="game.removeAllAnimals()">Remove All (U)</button><br>
                <div id="animalCount" style="margin-top: 10px;">Animals: 0</div>
                <div id="animalSystemStatus" style="margin-top: 5px; font-weight: bold;">Status: <span style="color: #00ff00;">ON</span></div>
                <div id="animalStats" style="margin-top: 5px; font-size: 12px;"></div>
            </div>
        `;
        document.body.appendChild(animalControls);
        
        const style = document.createElement('style');
        style.textContent = `
            .animal-button {
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 5px 10px;
                margin: 2px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.3s ease;
            }
            .animal-button:hover {
                background: rgba(255,255,255,0.3);
                border-color: rgba(255,255,255,0.5);
            }
        `;
        document.head.appendChild(style);
    }
    
    updateAnimalUI() {
        if (!this.animalSystem) return;
    
        if (this.frameCount % 30 === 0) {
            this.updateAnimalCountDisplay();
            
            const status = this.animalSystem.getSystemStatus();
            this.updateAnimalSystemStatus(status.enabled);
        }
    }
    
    updateAnimalCountDisplay() {
        const animalCount = document.getElementById('animalCount');
        if (animalCount && this.animalSystem) {
            const count = this.animalSystem.getAnimalCount();
            animalCount.textContent = `Animals: ${count}`;
        }
    }
    
    displayAnimalStatsInUI(stats) {
        const animalStats = document.getElementById('animalStats');
        if (animalStats) {
            let statsText = '';
            Object.entries(stats).forEach(([type, count]) => {
                if (count > 0) {
                    statsText += `${type}: ${count} `;
                }
            });
            animalStats.textContent = statsText;
        }
    }

    spawnRandomAnimal() {
        const event = new KeyboardEvent('keydown', { code: 'KeyO' });
        document.dispatchEvent(event);
    }
    
    createWeatherSystem() {
        this.createRainSystem();
        this.createPuddleSystem();
    }
    
    createRainSystem() {
        const rainCount = 5000;
        this.weatherSystem.rainGeometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount * 3);
        const lifetimes = new Float32Array(rainCount);
        
        for (let i = 0; i < rainCount; i++) {
            // ogni particella occupa tre posizioni consecutive
            const i3 = i * 3;
            
            positions[i3] = (Math.random() - 0.5) * 200;
            positions[i3 + 1] = Math.random() * 100 + 50;
            positions[i3 + 2] = (Math.random() - 0.5) * 200;
            
            velocities[i3] = (Math.random() - 0.5) * 0.1;
            velocities[i3 + 1] = -0.5 - Math.random() * 0.5;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
            
            lifetimes[i] = Math.random() * 100;
        }
        
        this.weatherSystem.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.weatherSystem.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        this.weatherSystem.rainGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        
        this.weatherSystem.rainMaterial = new THREE.PointsMaterial({
            color: 0x87CEEB,
            size: 0.3,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            vertexColors: false
        });
        
        this.weatherSystem.rainParticles = new THREE.Points(
            this.weatherSystem.rainGeometry, 
            this.weatherSystem.rainMaterial
        );
        this.weatherSystem.rainParticles.visible = false;
        this.scene.add(this.weatherSystem.rainParticles);
    }
    
    createPuddleSystem() {
        this.weatherSystem.puddles = [];
    }

    createPuddle(x, z) {
        const y = this.getHeightAtPosition(x, z) + 0.05;
        const size = 0.5 + Math.random() * 1.5;
        
        // Geometria della pozza (plane circolare)
        const puddleGeometry = new THREE.CircleGeometry(size, 16);
        puddleGeometry.rotateX(-Math.PI / 2);
        
        const puddleMaterial = new THREE.MeshPhongMaterial({
            color: 0x4A90E2,
            transparent: true,
            opacity: 0.7,
            shininess: 100,
            specular: 0x111111,
            reflectivity: 0.8
        });
        
        const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial);
        puddle.position.set(x, y, z);
        puddle.receiveShadow = true;
        
        this.scene.add(puddle);
        
        this.weatherSystem.puddles.push({
            mesh: puddle,
            lifetime: this.weatherSystem.puddleLifetime,
            maxLifetime: this.weatherSystem.puddleLifetime,
            size: size,
            evaporating: false
        });
    }
    
    updateWeatherSystem() {
        // transizione graduale dell'intensità della pioggi
        if (this.weatherSystem.rainIntensity !== this.weatherSystem.targetRainIntensity) {
            const diff = this.weatherSystem.targetRainIntensity - this.weatherSystem.rainIntensity;
            // effetto easing: valori più alti creano cambiamenti più rapidi, mentre valori più bassi rendono la transizione più lenta
            this.weatherSystem.rainIntensity += diff * 0.02;
            
            if (Math.abs(diff) < 0.01) {
                this.weatherSystem.rainIntensity = this.weatherSystem.targetRainIntensity;
            }
        }
        
        this.weatherSystem.rainParticles.visible = this.weatherSystem.rainIntensity > 0.01;
        this.weatherSystem.rainMaterial.opacity = this.weatherSystem.rainIntensity * 0.8;
        
        if (this.weatherSystem.rainParticles.visible) {
            this.updateRainParticles();
            this.createRandomPuddles();
        }
        
        // Aggiorna le pozze
        this.updatePuddles();
        this.updateAtmosphericEffects();
        this.updateWeatherUI();
    }
    
    updateRainParticles() {
        const positions = this.weatherSystem.rainGeometry.attributes.position.array;
        const velocities = this.weatherSystem.rainGeometry.attributes.velocity.array;
        const lifetimes = this.weatherSystem.rainGeometry.attributes.lifetime.array;
        
        const playerPos = this.player.position;
        
        // invece di creare nuove particelle, riutilizziamo quelle esistenti
        for (let i = 0; i < positions.length; i += 3) {
            const particleIndex = i / 3;
            
            positions[i] += velocities[i] * this.weatherSystem.rainIntensity;
            positions[i + 1] += velocities[i + 1] * this.weatherSystem.rainIntensity;
            positions[i + 2] += velocities[i + 2] * this.weatherSystem.rainIntensity;
            
            const groundHeight = this.getHeightAtPosition(positions[i], positions[i + 2]);
            if (positions[i + 1] <= groundHeight + 0.1) {
                // Crea effetto splash occasionale
                if (Math.random() < 0.01 && this.weatherSystem.rainIntensity > 0.3) {
                    this.createSplashEffect(positions[i], groundHeight, positions[i + 2]);
                }
                
                // Rispawna la goccia
                positions[i] = playerPos.x + (Math.random() - 0.5) * 100;
                positions[i + 1] = playerPos.y + 30 + Math.random() * 20;
                positions[i + 2] = playerPos.z + (Math.random() - 0.5) * 100;
                
                lifetimes[particleIndex] = 100 + Math.random() * 50;
            }
            
            lifetimes[particleIndex] -= 1;
            if (lifetimes[particleIndex] <= 0) {
                positions[i] = playerPos.x + (Math.random() - 0.5) * 100;
                positions[i + 1] = playerPos.y + 30 + Math.random() * 20;
                positions[i + 2] = playerPos.z + (Math.random() - 0.5) * 100;
                lifetimes[particleIndex] = 100 + Math.random() * 50;
            }
        }
        
        this.weatherSystem.rainGeometry.attributes.position.needsUpdate = true;
    }
    
    createSplashEffect(x, y, z) {
        const splashCount = 8;
        const splashGeometry = new THREE.BufferGeometry();
        const splashPositions = new Float32Array(splashCount * 3);
        const splashVelocities = [];
        
        for (let i = 0; i < splashCount; i++) {
            const i3 = i * 3;
            splashPositions[i3] = x;
            splashPositions[i3 + 1] = y + 0.1;
            splashPositions[i3 + 2] = z;
            
            // Velocità radiale per effetto splash
            const angle = (i / splashCount) * Math.PI * 2;
            const speed = 0.1 + Math.random() * 0.1;
            
            splashVelocities.push(new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * 0.2,
                Math.sin(angle) * speed
            ));
        }
        
        splashGeometry.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
        
        const splashMaterial = new THREE.PointsMaterial({
            color: 0x87CEEB,
            size: 0.2,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending // crea un effetto di sovrapposizione luminosa che simula la rifrazione della luce attraverso le goccioline d'acqua
        });
        
        const splash = new THREE.Points(splashGeometry, splashMaterial);
        this.scene.add(splash);
        
        // Anima lo splash
        let splashLife = 20;
        const animateSplash = () => {
            const positions = splash.geometry.attributes.position.array;
            
            for (let i = 0; i < positions.length; i += 3) {
                const velIndex = i / 3;
                positions[i] += splashVelocities[velIndex].x;
                positions[i + 1] += splashVelocities[velIndex].y;
                positions[i + 2] += splashVelocities[velIndex].z;
                
                // Gravità
                splashVelocities[velIndex].y -= 0.02;
            }
            
            splash.geometry.attributes.position.needsUpdate = true;
            splash.material.opacity = splashLife / 20;
            
            splashLife--;
            if (splashLife > 0) {
                requestAnimationFrame(animateSplash);
            } else {
                this.scene.remove(splash);
            }
        };
        
        animateSplash();
    }
    
    createRandomPuddles() {
        // Crea pozze casuali durante la pioggia
        if (this.weatherSystem.rainIntensity > 0.2 && 
            Math.random() < 0.02 && 
            this.weatherSystem.puddles.length < this.weatherSystem.maxPuddles) {
            
            const puddleX = this.player.position.x + (Math.random() - 0.5) * 40;
            const puddleZ = this.player.position.z + (Math.random() - 0.5) * 40;

            // Verifica la pendenza del terreno nella posizione proposta
            const slope = this.getSlope(puddleX, puddleZ);
            
            // Controlla se c'è già una pozza nelle vicinanze usando la distanza euclidea
            // l' asse y non ci interessa perché le pozze sono sul terreno
            const tooClose = this.weatherSystem.puddles.some(puddle => {
                const distance = Math.sqrt(
                    Math.pow(puddle.mesh.position.x - puddleX, 2) +
                    Math.pow(puddle.mesh.position.z - puddleZ, 2)
                );
                return distance < 3;
            });
            
            if (!tooClose && slope < this.weatherSystem.puddleSlopeThreshold) {
                this.createPuddle(puddleX, puddleZ);
            }
        }
    }
    
    updatePuddles() {
        for (let i = this.weatherSystem.puddles.length - 1; i >= 0; i--) {
            const puddle = this.weatherSystem.puddles[i];
            
            // Se non piove, inizia l'evaporazione
            if (this.weatherSystem.rainIntensity < 0.1 && !puddle.evaporating) {
                puddle.evaporating = true;
            }
            
            // Aggiorna lifetime
            if (puddle.evaporating) {
                puddle.lifetime -= 1;
                
                // Effetto di evaporazione
                const evaporationProgress = 1 - (puddle.lifetime / puddle.maxLifetime);
                puddle.mesh.material.opacity = 0.7 * (1 - evaporationProgress);
                puddle.mesh.scale.setScalar(1 - evaporationProgress * 0.3); // la scala si riduce del 30%
                
                // Rimuovi pozza quando evaporata
                if (puddle.lifetime <= 0) {
                    this.scene.remove(puddle.mesh);
                    this.weatherSystem.puddles.splice(i, 1);
                }
            } else if (this.weatherSystem.rainIntensity > 0.1) {
                // Durante la pioggia, mantieni o aumenta l'opacità
                puddle.mesh.material.opacity = Math.min(0.7, puddle.mesh.material.opacity + 0.01);
            }
            
            // Animazione riflessi
            if (puddle.mesh.material.opacity > 0.1) {
                const time = Date.now() * 0.001;
                puddle.mesh.material.shininess = 100 + Math.sin(time * 2 + i) * 20;
            }
        }
    }

    updateAtmosphericEffects() {
        // Aggiorna nebbia in base al tempo
        if (this.scene.fog) {
            const baseNear = 50;
            const baseFar = 400;
            const rainEffect = this.weatherSystem.rainIntensity * 0.5;
            
            this.scene.fog.near = baseNear * (1 - rainEffect);
            this.scene.fog.far = baseFar * (1 - rainEffect * 0.3);
        }
        
        if (this.ambientLight) {
            const baseIntensity = 0.3;
            const rainDimming = this.weatherSystem.rainIntensity * 0.2;
            this.ambientLight.intensity = baseIntensity - rainDimming;
        }
    }
    
    updateWeatherUI() {
        const weatherStatus = document.getElementById('weatherStatus');
        if (weatherStatus) {
            if (this.weatherSystem.rainIntensity > 0.7) {
                weatherStatus.textContent = 'Heavy Rain';
            } else if (this.weatherSystem.rainIntensity > 0.3) {
                weatherStatus.textContent = 'Rain';
            } else if (this.weatherSystem.rainIntensity > 0.1) {
                weatherStatus.textContent = 'Light Rain';
            } else {
                weatherStatus.textContent = 'Clear';
            }
        }
    }
    
    toggleRain() {
        if (this.weatherSystem.targetRainIntensity > 0.1) {
            this.setWeather('clear');
        } else {
            this.setWeather('rain');
        }
    }
    
    setWeather(type) {
        switch(type) {
            case 'clear':
                this.weatherSystem.targetRainIntensity = 0.0;
                this.weatherSystem.isRaining = false;
                break;
            case 'light':
                this.weatherSystem.targetRainIntensity = 0.4;
                this.weatherSystem.isRaining = true;
                break;
            case 'rain':
                this.weatherSystem.targetRainIntensity = 0.7;
                this.weatherSystem.isRaining = true;
                this.weatherSystem.maxPuddles = 30; // Aumenta il numero di pozze durante la pioggia
                break;
            case 'heavy':
                this.weatherSystem.targetRainIntensity = 1.0;
                this.weatherSystem.isRaining = true;
                this.weatherSystem.maxPuddles = 50; // Aumenta ulteriormente il numero di pozze durante la pioggia intensa
                break;
        }
    }
    
    setupWeatherControls() {
        document.getElementById('toggleRain').addEventListener('click', () => {
            this.toggleRain();
        });
        
        document.getElementById('lightRain').addEventListener('click', () => {
            this.setWeather('light');
        });
        
        document.getElementById('heavyRain').addEventListener('click', () => {
            this.setWeather('heavy');
        });
        
        document.getElementById('clearWeather').addEventListener('click', () => {
            this.setWeather('clear');
        });
    }
    
    createTerrain() {
        const size = 512;
        const segments = 256;
        
        this.terrainGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
        this.terrainGeometry.rotateX(-Math.PI / 2); // trasforma il piano dalla sua orientazione verticale predefinita (piano XY) a quella orizzontale (piano XZ)
        
        const vertices = this.terrainGeometry.attributes.position.array;
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            
            let height = 0;
            height += this.noise(x * 0.01, z * 0.01) * 20;
            height += this.noise(x * 0.05, z * 0.05) * 8;
            height += this.noise(x * 0.1, z * 0.1) * 3;
            
            vertices[i + 1] = height;
        }
        
        this.terrainGeometry.attributes.position.needsUpdate = true;
        this.terrainGeometry.computeVertexNormals(); // ricalcola le normali dei vertici necessarie per l'illuminazione corretta
        
        const terrainMaterial = new THREE.MeshLambertMaterial({
            map: this.createBlendedTerrainTexture(),
        });
        
        this.terrainMaterial = terrainMaterial;
        
        this.terrain = new THREE.Mesh(this.terrainGeometry, terrainMaterial);
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);
        
        this.terrainSize = size;
        this.terrainSegments = segments;
    }
    
    noise(x, y) {
        return (Math.sin(x * 0.7) * Math.cos(y * 0.7) + 
                Math.sin(x * 1.3) * Math.cos(y * 1.3) * 0.5 +
                Math.sin(x * 2.1) * Math.cos(y * 2.1) * 0.25) * 0.5;
    }
    
    createBlendedTerrainTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        
        for (let i = 0; i < imageData.data.length; i += 4) {
            // itera attraverso ogni pixel, convertendo l'indice lineare in coordinate 2D
            // ogni pixel è rappresentato da 4 valori (RGBA)
            // i / 4 = indice del pixel corrente
            const x = (i / 4) % size;
            const y = Math.floor((i / 4) / size);
            
            const height = this.noise(x * 0.02, y * 0.02) * 10;
            const slope = Math.abs(this.noise(x * 0.05, y * 0.05)) * 0.8;
            
            let grassR = 50, grassG = 120, grassB = 30;
            let rockR = 100, rockG = 100, rockB = 100;
            let sandR = 180, sandG = 160, sandB = 100;
            
            const variation = this.noise(x * 0.1, y * 0.1) * 0.3 + 0.7; // genera valori tra 0.7 e 1.0
            grassR *= variation; grassG *= variation; grassB *= variation;
            rockR *= variation; rockG *= variation; rockB *= variation;
            sandR *= variation; sandG *= variation; sandB *= variation;
            
            let r = grassR, g = grassG, b = grassB;
            
            if (slope > 0.4) {
                const rockFactor = (slope - 0.4) / 0.4;
                r = grassR + (rockR - grassR) * rockFactor;
                g = grassG + (rockG - grassG) * rockFactor;
                b = grassB + (rockB - grassB) * rockFactor;
            }
            
            if (height < 2) {
                const sandFactor = (2 - height) / 4;
                r = r + (sandR - r) * sandFactor * 0.6;
                g = g + (sandG - g) * sandFactor * 0.6;
                b = b + (sandB - b) * sandFactor * 0.6;
            }
            
            imageData.data[i] = Math.max(0, Math.min(255, r)); // Red
            imageData.data[i + 1] = Math.max(0, Math.min(255, g)); // Green
            imageData.data[i + 2] = Math.max(0, Math.min(255, b)); // Blue
            imageData.data[i + 3] = 255; // Alpha (opaco)
        }
        
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4); // ripete il pattern 4 volte in entrambe le direzioni
        return texture;
    }
    
    createLighting() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        
        // Risoluzione della texture delle ombre
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;

        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 300;
        
        // Area quadrata di 300x300 unità dove si calcolano le ombre
        this.sunLight.shadow.camera.left = -150;
        this.sunLight.shadow.camera.right = 150;
        this.sunLight.shadow.camera.top = 150;
        this.sunLight.shadow.camera.bottom = -150;
        
        this.sunLight.shadow.bias = -0.0001; // offset per prevenire pixel tremolanti nelle ombre
        this.sunLight.shadow.normalBias = 0.02;
        
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.target.position.set(0, 0, 0);
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
        
        this.moonLight = new THREE.DirectionalLight(0x4444ff, 0.2);
        this.moonLight.castShadow = true;

        // Risoluzione inferiore rispetto al sole
        this.moonLight.shadow.mapSize.width = 2048;
        this.moonLight.shadow.mapSize.height = 2048;
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = 200;
        this.moonLight.shadow.camera.left = -100;
        this.moonLight.shadow.camera.right = 100;
        this.moonLight.shadow.camera.top = 100;
        this.moonLight.shadow.camera.bottom = -100;
        this.moonLight.shadow.bias = -0.0001;

        this.moonLight.position.set(-50, 100, -50);  // Posizione iniziale opposta al sole
        this.moonLight.target.position.set(0, 0, 0); // puntamento verso il centro della scena
        this.scene.add(this.moonLight);
        
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(this.ambientLight);
        
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 400); // Nebbia lineare che aumenta con la distanza
    }
    
    updateDayNightCycle() {
        this.timeSystem.currentTime += this.timeSystem.timeSpeed;
        if (this.timeSystem.currentTime >= 24) {
            this.timeSystem.currentTime = 0;
        }
        
        // converte il tempo lineare in una posizione circolare
        // l'offset di -Math.PI / 2 fa iniziare il sole dall'orizzonte est
        const sunAngle = (this.timeSystem.currentTime / 24) * Math.PI * 2 - Math.PI / 2;
        this.timeSystem.sunPosition.set(
            Math.cos(sunAngle) * 150,
            Math.sin(sunAngle) * 150,
            0
        );
        
        this.timeSystem.moonPosition.set(
            -this.timeSystem.sunPosition.x,
            -this.timeSystem.sunPosition.y,
            0
        );
        
        this.sunLight.position.copy(this.timeSystem.sunPosition);
        this.sunLight.target.position.set(0, 0, 0);
        this.sunLight.target.updateMatrixWorld();
        
        this.updateShadowCamera();
        
        this.moonLight.position.copy(this.timeSystem.moonPosition);
        this.moonLight.target.position.set(0, 0, 0);
        this.moonLight.target.updateMatrixWorld();
        
        const sunHeight = Math.sin(sunAngle);
        const isDay = sunHeight > 0;
        
        if (isDay) {
            this.sunLight.intensity = Math.max(0.1, sunHeight * 1.5);
            this.moonLight.intensity = 0;
            
            const sunColorIntensity = Math.max(0.3, sunHeight);
            this.sunLight.color.setRGB(
                1.0,
                0.8 + sunColorIntensity * 0.2,
                0.6 + sunColorIntensity * 0.4
            );
        } else {
            this.sunLight.intensity = 0;
            this.moonLight.intensity = Math.abs(sunHeight) * 0.4;
            this.moonLight.color.setRGB(0.6, 0.7, 1.0);
        }
        
        const skyColor = isDay ? 
            new THREE.Color().setHSL(0.55, 0.6, 0.5 + sunHeight * 0.3) :
            new THREE.Color().setHSL(0.65, 0.8, 0.1);
        
        this.renderer.setClearColor(skyColor);
        this.scene.fog.color.copy(skyColor);
        
        const hours = Math.floor(this.timeSystem.currentTime);
        const minutes = Math.floor((this.timeSystem.currentTime % 1) * 60);
        document.getElementById('timeDisplay').textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    updateShadowCamera() {
        const sunHeight = this.timeSystem.sunPosition.y;
        
        if (sunHeight > 0) {
            const playerPos = this.player.position;
            this.sunLight.target.position.copy(playerPos);
            
            const shadowSize = 80 + (1 - sunHeight / 150) * 40; // espande dinamicamente l'area delle ombre quando il sole è basso nel cielo
            
            this.sunLight.shadow.camera.left = -shadowSize;
            this.sunLight.shadow.camera.right = shadowSize;
            this.sunLight.shadow.camera.top = shadowSize;
            this.sunLight.shadow.camera.bottom = -shadowSize;
            
            this.sunLight.shadow.camera.near = 1;
            this.sunLight.shadow.camera.far = 250 + (1 - sunHeight / 150) * 100;
            
            this.sunLight.shadow.camera.updateProjectionMatrix();
            this.sunLight.target.updateMatrixWorld();
        }
    }
    
    createSkybox() {
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        // GLSL
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                sunPosition: { value: this.timeSystem.sunPosition }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                // eseguita per ogni vertice
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz; // estrae le componenti X, Y, Z dalle coordinate omogenee e le assegna alla variabile varying
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); // posizione finale sullo schermo del vertice
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 sunPosition;
                varying vec3 vWorldPosition; // riceve la posizione mondiale calcolata nel vertex shader
                
                void main() {
                    vec3 direction = normalize(vWorldPosition); // direzione dal centro della sfera al pixel corrente

                    float sunDot = dot(direction, normalize(sunPosition)); // prodotto scalare tra direzione pixel e direzione sole
                    
                    vec3 skyColor = mix(
                        vec3(0.1, 0.1, 0.3), // Colore notturno (blu scuro)
                        vec3(0.5, 0.7, 1.0), // Colore diurno (azzurro)
                        max(0.0, sunPosition.y / 200.0) // Fattore di interpolazione
                    );
                    
                    float sunGlow = pow(max(0.0, sunDot), 32.0) * 0.5;
                    skyColor += vec3(1.0, 0.8, 0.6) * sunGlow;
                    
                    gl_FragColor = vec4(skyColor, 1.0); // colore finale del pixel
                }
            `,
            side: THREE.BackSide // vediamo il cielo dall'interno della sfera
        });
        
        this.skybox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(this.skybox);
    }
    
    createVegetation() {
        for (let i = 0; i < 200; i++) {
            const x = (Math.random() - 0.5) * 400;
            const z = (Math.random() - 0.5) * 400;
            const y = this.getHeightAtPosition(x, z);
            
            if (y > 2 && this.getSlope(x, z) < 0.3) {
                this.createTree(x, y, z);
            }
        }
    }
    
    createTree(x, y, z) {
        const treeGroup = new THREE.Group();
        
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
        const trunkMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x4a2c2a,
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        treeGroup.add(trunk);
        
        const crownGeometry = new THREE.SphereGeometry(2.5, 16, 12);
        const crownMaterial = new THREE.MeshLambertMaterial({
            color: 0x228B22,
            transparent: false
        });
        
        const crown = new THREE.Mesh(crownGeometry, crownMaterial);
        crown.position.y = 5;
        crown.castShadow = true;
        crown.receiveShadow = true;
        treeGroup.add(crown);
        
        treeGroup.position.set(x, y, z);
        this.scene.add(treeGroup);
        
        this.vegetation.push({
            group: treeGroup,
            crown: crown,
            trunk: trunk,
            material: crownMaterial,
            windOffset: Math.random() * Math.PI * 2,
            basePosition: crown.position.clone()
        });
    }
    
    createResources() {
        for (let i = 0; i < 50; i++) {
            const x = (Math.random() - 0.5) * 300;
            const z = (Math.random() - 0.5) * 300;
            const y = this.getHeightAtPosition(x, z) + 1;
            
            const crystalGeometry = new THREE.OctahedronGeometry(0.8);
            const crystalMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.8,
                emissive: 0x002244,
                depthWrite: true
            });
            
            const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
            crystal.position.set(x, y, z);
            crystal.castShadow = true;
            crystal.receiveShadow = true;
            
            this.scene.add(crystal);
            
            this.resources.push({
                mesh: crystal,
                collected: false,
                rotationSpeed: 0.01 + Math.random() * 0.02
            });
        }
    }
    
    updateResources() {
        this.resources.forEach((resource, index) => {
            if (!resource.collected) {
                resource.mesh.rotation.y += resource.rotationSpeed;
                resource.mesh.rotation.x += resource.rotationSpeed * 0.5;
                
                // effetto lievitazione
                resource.mesh.position.y += Math.sin(Date.now() * 0.003 + index) * 0.01;
                
                const distance = this.player.position.distanceTo(resource.mesh.position);
                if (distance < 4) {
                    resource.mesh.material.emissive.setHex(0x004488);
                    resource.mesh.scale.setScalar(1.2);
                    
                    if (this.keys['KeyE'] && distance < 4) {
                        this.collectResource(resource, index);
                    }
                } else {
                    resource.mesh.material.emissive.setHex(0x002244);
                    resource.mesh.scale.setScalar(1.0);
                }
            }
        });
    }
    
    collectResource(resource, index) {
        if (!resource.collected) {
            resource.collected = true;
            this.player.resources++;
            
            this.createCollectionEffect(resource.mesh.position);
            this.scene.remove(resource.mesh);
            
            document.getElementById('resourceCount').textContent = this.player.resources;
        }
    }
    
    createCollectionEffect(position) {
        const particleCount = 20;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = position.x;
            positions[i3 + 1] = position.y;
            positions[i3 + 2] = position.z;
            
            const direction = new THREE.Vector3(
                (Math.random() - 0.5) * 2, // genera valori tra -1 e +1
                Math.random(), // forza verso l'alto
                (Math.random() - 0.5) * 2 // genera valori tra -1 e +1
            ).normalize();
            
            velocities.push(direction.multiplyScalar(0.2 + Math.random() * 0.3));
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.3,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        
        const effectParticles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(effectParticles);
        
        let lifetime = 60;
        // dissolvenza graduale
        const animateEffect = () => {
            const positions = effectParticles.geometry.attributes.position.array;
            
            for (let i = 0; i < positions.length; i += 3) {
                const velIndex = i / 3;
                positions[i] += velocities[velIndex].x;
                positions[i + 1] += velocities[velIndex].y;
                positions[i + 2] += velocities[velIndex].z;
                
                velocities[velIndex].y -= 0.01;
            }
            
            effectParticles.geometry.attributes.position.needsUpdate = true;
            effectParticles.material.opacity = lifetime / 60;
            
            lifetime--;
            if (lifetime > 0) {
                requestAnimationFrame(animateEffect);
            } else {
                this.scene.remove(effectParticles);
            }
        };
        
        animateEffect();
    }
    
    setupControls() {
        document.addEventListener('keydown', (event) => {
            this.keys[event.code] = true;
            
            if (event.code === 'KeyT') {
                this.timeSystem.timeSpeed = this.timeSystem.timeSpeed === 0.01 ? 0.1 : 0.01;
            }
            if (event.code === 'KeyZ') {
                this.timeSystem.timeSpeed = 0;
                this.timeSystem.currentTime = 11;
            }
            
            if (event.code === 'KeyR') {
                this.toggleRain();
            }
            
            // CONTROLLI VENTO
            if (event.code === 'KeyW' && event.shiftKey) {
                event.preventDefault();
                this.toggleWind();
            }
            
            // Pattern vento (1-5)
            if (event.code === 'Digit1') this.setWindPattern('calm');
            if (event.code === 'Digit2') this.setWindPattern('gentle');
            if (event.code === 'Digit3') this.setWindPattern('moderate');
            if (event.code === 'Digit4') this.setWindPattern('strong');
            if (event.code === 'Digit5') this.setWindPattern('storm');
            
            // Direzioni vento (Ctrl + frecce)
            if (event.code === 'ArrowUp' && event.ctrlKey) {
                event.preventDefault();
                this.setWindDirection(0, -1); // Nord
            }
            if (event.code === 'ArrowDown' && event.ctrlKey) {
                event.preventDefault();
                this.setWindDirection(0, 1); // Sud
            }
            if (event.code === 'ArrowLeft' && event.ctrlKey) {
                event.preventDefault();
                this.setWindDirection(-1, 0); // Ovest
            }
            if (event.code === 'ArrowRight' && event.ctrlKey) {
                event.preventDefault();
                this.setWindDirection(1, 0); // Est
            }
            
            // CONTROLLI ANIMALI
            if (event.code === 'KeyO') {
                this.spawnRandomAnimal();
            }
            
            if (event.code === 'KeyI') {
                if (this.animalSystem) {
                    const status = this.animalSystem.toggle();
                    this.updateAnimalSystemStatus(status);
                }
            }
            
            if (event.code === 'KeyU') {
                if (this.animalSystem) {
                    this.animalSystem.removeAllAnimals();
                    this.updateAnimalCountDisplay();
                }
            }
            
            if (event.code === 'KeyY') {
                if (this.animalSystem) {
                    const status = this.animalSystem.getSystemStatus();
                    if (status.spawningPaused) {
                        this.animalSystem.resumeSpawning();
                    } else {
                        this.animalSystem.pauseSpawning();
                    }
                }
            }
            
            if (event.code === 'KeyH') {
                if (this.animalSystem) {
                    this.animalSystem.animals.forEach(animal => {
                        if (animal.type === 'wolf') {
                            this.animalSystem.createWolfHowlAnimation(animal);
                        }
                    });
                }
            }
            
            if (event.code === 'KeyL') {
                if (this.animalSystem) {
                    this.animalSystem.testWolfModel();
                }
            }
            
            if (event.code === 'KeyP') {
                this.debugTerrainHeight(this.player.position.x, this.player.position.z);
            }
        });
        
        document.addEventListener('keyup', (event) => {
            this.keys[event.code] = false;
        });
        
        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement) {
                this.mouse.x -= event.movementX * this.mouse.sensitivity;
                this.mouse.y -= event.movementY * this.mouse.sensitivity;
                this.mouse.y = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.mouse.y));
            }
        });
        
        this.renderer.domElement.addEventListener('click', () => {
            this.renderer.domElement.requestPointerLock();
        });
        
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    updatePlayerMovement() {
        const moveVector = new THREE.Vector3();
        
        // Controlla se Shift è premuto per evitare conflitti con controlli vento
        const isShiftHeld = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        
        if ((this.keys['KeyW'] || this.keys['ArrowUp']) && !isShiftHeld) moveVector.z -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) moveVector.z += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveVector.x -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) moveVector.x += 1;
        
        if (moveVector.length() > 0) {
            moveVector.normalize();
            moveVector.multiplyScalar(this.player.moveSpeed);
            
            moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mouse.x);
            
            this.player.velocity.x = moveVector.x;
            this.player.velocity.z = moveVector.z;
        } else {
            this.player.velocity.x *= 0.8;
            this.player.velocity.z *= 0.8;
        }
        
        if (this.keys['Space'] && this.player.onGround) {
            this.player.velocity.y = this.player.jumpForce;
            this.player.onGround = false;
        }
        
        this.player.velocity.y -= 0.02;
        this.player.position.add(this.player.velocity);
        
        const groundHeight = this.getHeightAtPosition(
            this.player.position.x, 
            this.player.position.z
        ) + 1.8;
        
        if (this.player.position.y <= groundHeight) {
            this.player.position.y = groundHeight;
            this.player.velocity.y = 0;
            this.player.onGround = true;
        }
        
        const maxDistance = 200;
        if (Math.abs(this.player.position.x) > maxDistance) {
            this.player.position.x = Math.sign(this.player.position.x) * maxDistance;
        }
        if (Math.abs(this.player.position.z) > maxDistance) {
            this.player.position.z = Math.sign(this.player.position.z) * maxDistance;
        }
    }
    
    updatePlayerPosition() {
        this.camera.position.copy(this.player.position);
        this.camera.rotation.x = this.mouse.y;
        this.camera.rotation.y = this.mouse.x;
        
        if (this.animalSystem) {
            this.animalSystem.setPlayerPosition(this.player.position);
        }
        
        document.getElementById('heightDisplay').textContent = Math.round(this.player.position.y - 1.8);
    }
    
    // campionamento del terreno con interpolazione bilineare
    getHeightAtPosition(x, z) {
        const halfSize = this.terrainSize / 2;
        
        const clampedX = Math.max(-halfSize, Math.min(halfSize, x));
        const clampedZ = Math.max(-halfSize, Math.min(halfSize, z));
        
        const mapX = ((clampedX + halfSize) / this.terrainSize) * this.terrainSegments;
        const mapZ = ((clampedZ + halfSize) / this.terrainSize) * this.terrainSegments;
        
        const x1 = Math.floor(mapX);
        const z1 = Math.floor(mapZ);
        const x2 = Math.min(x1 + 1, this.terrainSegments);
        const z2 = Math.min(z1 + 1, this.terrainSegments);
        
        const fx = mapX - x1;
        const fz = mapZ - z1;
        
        const h1 = this.getHeightAtGridPosition(x1, z1);
        const h2 = this.getHeightAtGridPosition(x2, z1);
        const h3 = this.getHeightAtGridPosition(x1, z2);
        const h4 = this.getHeightAtGridPosition(x2, z2);
        
        const h12 = h1 * (1 - fx) + h2 * fx;
        const h34 = h3 * (1 - fx) + h4 * fx;

        const finalHeight = h12 * (1 - fz) + h34 * fz;
        
        return finalHeight;
    }

    getHeightAtGridPosition(gridX, gridZ) {
        const clampedX = Math.max(0, Math.min(this.terrainSegments, gridX));
        const clampedZ = Math.max(0, Math.min(this.terrainSegments, gridZ));
        
        const index = clampedZ * (this.terrainSegments + 1) + clampedX;
        
        const vertices = this.terrainGeometry.attributes.position.array;
        if (index * 3 + 1 < vertices.length) {
            return vertices[index * 3 + 1];
        }
        
        return 0;
    }
    
    getSlope(x, z) {
        const offset = 2;
        const h1 = this.getHeightAtPosition(x - offset, z);
        const h2 = this.getHeightAtPosition(x + offset, z);
        const h3 = this.getHeightAtPosition(x, z - offset);
        const h4 = this.getHeightAtPosition(x, z + offset);
        
        const dx = (h2 - h1) / (offset * 2);
        const dz = (h4 - h3) / (offset * 2);
        
        return Math.sqrt(dx * dx + dz * dz);
    }

    findFlatGround(x, z) {
        const searchRadius = 5;
        const samples = 8;
        
        let bestDirection = null;
        let lowestSlope = Infinity;
        
        for (let i = 0; i < samples; i++) {
            const angle = (i / samples) * Math.PI * 2;
            const testX = x + Math.cos(angle) * searchRadius;
            const testZ = z + Math.sin(angle) * searchRadius;
            
            const slope = this.getSlope(testX, testZ);
            
            if (slope < lowestSlope) {
                lowestSlope = slope;
                bestDirection = new THREE.Vector3(
                    testX - x,
                    0,
                    testZ - z
                ).normalize();
            }
        }
        
        return bestDirection;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.frameCount++;
        
        this.updatePlayerMovement();
        this.updatePlayerPosition();
        this.updateDayNightCycle();
        this.updateWeatherSystem();
        this.updateWindSystem();
        this.updateResources();

        if (this.animalSystem) {
            this.animalSystem.update();
        }

        this.updateAnimalUI();
        
        if (this.skybox) {
            this.skybox.material.uniforms.time.value = Date.now() * 0.001;
            this.skybox.material.uniforms.sunPosition.value.copy(this.timeSystem.sunPosition);
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    spawnRandomAnimal() {
        if (!this.animalSystem) return;

        const types = ['wolf'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        const angle = Math.random() * Math.PI * 2;
        const distance = 10 + Math.random() * 20;
        const x = this.player.position.x + Math.cos(angle) * distance;
        const z = this.player.position.z + Math.sin(angle) * distance;
        
        this.animalSystem.addAnimal(randomType, x, z);
        console.log(`🦌 Spawned ${randomType} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        
        this.updateAnimalCountDisplay();
    }
    
    showAnimalStats() {
        if (!this.animalSystem) return;
        
        const stats = this.animalSystem.getAnimalStats();
                
        this.displayAnimalStatsInUI(stats);
    }

    setupAnimalEvents() {
        document.addEventListener('animalSpawned', (event) => {
            console.log(`🐾 New ${event.detail.type} spawned!`);
        });
        
        document.addEventListener('animalDied', (event) => {
            console.log(`💀 ${event.detail.type} died of ${event.detail.cause}`);
        });

        document.addEventListener('animalStatsChanged', (event) => {
            const statsData = event.detail;
            
            const animalCount = document.getElementById('animalCount');
            if (animalCount) {
                animalCount.textContent = `Animals: ${statsData.totalCount}`;
            }

            const animalStats = document.getElementById('animalStats');
            if(animalStats) this.showAnimalStats();
        });
    }

    toggleAnimalSystem() {
        if (this.animalSystem) {
            const status = this.animalSystem.toggle();
            this.updateAnimalSystemStatus(status);
            return status;
        }
        return false;
    }

    removeAllAnimals() {
        if (this.animalSystem) {
            this.animalSystem.removeAllAnimals();
            this.updateAnimalCountDisplay();
        }
    }

    updateAnimalSystemStatus(enabled) {
        const statusElement = document.getElementById('animalSystemStatus');
        if (statusElement) {
            statusElement.textContent = enabled ? 'ON' : 'OFF';
            statusElement.style.color = enabled ? '#00ff00' : '#ff0000';
        }
    }

    debugTerrainHeight(x, z) {
        const height = this.getHeightAtPosition(x, z);
        const slope = this.getSlope(x, z);
        
        console.log(`🗻 Terrain at (${x.toFixed(1)}, ${z.toFixed(1)}): height=${height.toFixed(2)}, slope=${slope.toFixed(2)}`);
        
        const markerGeometry = new THREE.SphereGeometry(0.2);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        
        marker.position.set(x, height + 1, z);
        this.scene.add(marker);
        
        setTimeout(() => {
            this.scene.remove(marker);
        }, 3000);
    }
}

// Inizializzazione
window.addEventListener('load', () => {
    window.game = new PlanetaryExplorer();
});