import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export class AnimalSystem {
    constructor(scene, getHeightAtPosition, getSlope, findFlatGround, playerPosition, vegetationRef = null) {
        this.scene = scene;
        this.getHeightAtPosition = getHeightAtPosition;
        this.getSlope = getSlope;
        this.findFlatGround = findFlatGround;
        this.playerPosition = playerPosition;
        this.vegetation = vegetationRef;
        
        // Configurazione sistema
        this.config = {
            maxAnimals: 30,
            spawnRadius: 100,
            despawnRadius: 150,
            spawnChance: 0.01,
        };
        
        this.animalTypes = {
            wolf: {
                size: 1,
                speed: 0.05,
                behavior: 'predator',
                energy: 150,
                lifespan: 10000,
            }
        };
        
        // Behavior trees
        this.behaviorTrees = {
            predator: [
                { behavior: 'wander' }
            ],
        };
        
        // Array animali attivi
        this.animals = [];
        this.frameCount = 0;
        
        this.enabled = true;
        this.spawningPaused = false;

        this.modelLoader = new GLTFLoader();
        this.wolfModel = null;
        
        // Inizializza sistema
        this.init();
    }

    async init() {
        await this.loadWolfModel();
        this.createInitialPopulation();
        console.log(`AnimalSystem initialized with ${this.animals.length} animals`);
    }
    
    createInitialPopulation() {
        const types = Object.keys(this.animalTypes);
        
        for (let i = 0; i < this.config.maxAnimals * 0.5; i++) {
            const randomType = types[Math.floor(Math.random() * types.length)];
            
            // Posizione casuale intorno al giocatore
            const angle = Math.random() * Math.PI * 2;
            const distance = 20 + Math.random() * 60;
            const x = this.playerPosition.x + Math.cos(angle) * distance;
            const z = this.playerPosition.z + Math.sin(angle) * distance;
            
            this.spawnAnimal(randomType, x, z);
        }
    }
    
    // =============================================
    // GESTIONE ANIMALI
    // =============================================
    
    spawnAnimal(type, x, z) {
        const animalData = this.animalTypes[type];
        if (!animalData) return null;

        let y = this.getHeightAtPosition(x, z);

        // Crea mesh
        const mesh = this.createAnimalMesh(type, animalData);
        mesh.position.set(x, y, z);
        this.scene.add(mesh);
        
        // Crea oggetto animale
        const animal = {
            // Identificazione
            id: this.generateId(),
            type: type,
            data: animalData,
            mesh: mesh,
            
            // Stato fisico
            position: new THREE.Vector3(x, y, z),
            velocity: new THREE.Vector3(),
            acceleration: new THREE.Vector3(),
            onGround: true,
            
            // Stato biologico
            health: animalData.energy,
            energy: animalData.energy,
            thirst: 100,
            hunger: 100,
            age: 0,
            maxAge: animalData.lifespan,
            
            // Comportamento
            state: 'spawning',
            lastStateChange: Date.now(),
            waypoint: null,
            
            // Navigazione
            stuckTimer: 0,
            lastPosition: new THREE.Vector3(x, y, z),
        
            // Animazione
            animationTime: Math.random() * 1000,
        };
        
        this.animals.push(animal);
        this.dispatchStatsUpdate();
        return animal;
    }
    
    removeAnimal(animal) {
        // Rimuovi dalla scena
        this.scene.remove(animal.mesh);
        
        // Rimuovi dall'array
        const index = this.animals.indexOf(animal);
        if (index > -1) {
            this.animals.splice(index, 1);
        }

        // Aggiorna conteggio animali
        this.dispatchStatsUpdate();
    }
    
    // =============================================
    // CREAZIONE MESH
    // =============================================
    
    createAnimalMesh(type, animalData) {
        if (type === 'wolf' && this.wolfModelTemplate) { 
            return this.createWolfFromModel(animalData);
        }
    }
    
    // =============================================
    // SISTEMA PRINCIPALE DI AGGIORNAMENTO
    // =============================================
    
    update() {
        if (!this.enabled) return;
    
        this.frameCount++;
        
        // Aggiorna tutti gli animali
        this.animals.forEach(animal => {
            
            this.updateAnimalBehavior(animal);
            this.updateAnimalPhysics(animal);
            this.updateAnimalAnimation(animal);
            this.updateAnimalBiology(animal);
            
        });
        
        // Gestione popolazione
        this.managePopulation();
    
        
        // Cleanup periodico
        if (this.frameCount % 60 === 0) {
            this.performCleanup();
        }
    }
    
    // =============================================
    // SISTEMA COMPORTAMENTALE
    // =============================================
    
    updateAnimalBehavior(animal) {
        // Seleziona comportamento basato su priorità
        const behaviorType = this.behaviorTrees[animal.data.behavior];
        let selectedBehavior = behaviorType[0].behavior; // Comportamento di default
        
        // Cambia stato se necessario
        if (selectedBehavior !== animal.state) {
            animal.state = selectedBehavior;
        }
        
        // Esegui comportamento
        this.executeBehavior(animal, animal.state);
    }
    
    executeBehavior(animal, behavior) {
        // Reset accelerazione
        animal.acceleration.set(0, 0, 0);
        
        switch(behavior) {
            case 'wander':
                this.behaviorWander(animal);
                break;
        }
    }
    
    behaviorWander(animal) {
        // Inizializza stato wander se non esiste
        if (!animal.wanderState) {
            animal.wanderState = {
                waypoint: null,
                stuckTimer: 0,
                lastValidWaypoint: null,
                waypointReachDistance: 2,
                minWaypointDistance: 5,
                maxWaypointDistance: 15
            };
        }
        
        const wanderState = animal.wanderState;
        
        // Genera waypoint solo se necessario
        const needsNewWaypoint = !wanderState.waypoint || 
            animal.position.distanceTo(wanderState.waypoint) < wanderState.waypointReachDistance;
        
        if (needsNewWaypoint) {
            const newWaypoint = this.generateValidWaypoint(animal, wanderState);
            if (newWaypoint) {
                wanderState.waypoint = newWaypoint;
                wanderState.lastValidWaypoint = newWaypoint.clone();
                wanderState.stuckTimer = 0;
            } else if (wanderState.lastValidWaypoint) {
                // Usa ultimo waypoint valido se non riesce a generarne uno nuovo
                wanderState.waypoint = wanderState.lastValidWaypoint.clone();
            }
        }
        
        // Movimento verso waypoint con smoothing
        if (wanderState.waypoint) {
            const wanderDirection = new THREE.Vector3()
                .subVectors(wanderState.waypoint, animal.position)
                .normalize();
            
            // Applica forza graduale invece di movimento diretto
            const wanderForce = wanderDirection.multiplyScalar(animal.data.speed * 0.8);
            animal.acceleration.add(wanderForce);
            
            // Controllo se bloccato
            if (animal.velocity.length() < 0.05) {
                wanderState.stuckTimer++;
                if (wanderState.stuckTimer > 120) { // 2 secondi
                    wanderState.waypoint = null; // Forza nuovo waypoint
                    wanderState.stuckTimer = 0;
                }
            }
        }
        
        // Recupera energia lentamente
        animal.energy = Math.min(animal.data.energy, animal.energy + 0.05);
    }

    // =============================================
    // GENERAZIONE WAYPOINT
    // =============================================

    generateValidWaypoint(animal, wanderState) {
        const maxAttempts = 8;
        const currentPos = animal.position;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = wanderState.minWaypointDistance + 
                Math.random() * (wanderState.maxWaypointDistance - wanderState.minWaypointDistance);
            
            const testX = currentPos.x + Math.cos(angle) * distance;
            const testZ = currentPos.z + Math.sin(angle) * distance;
            
            // Verifica validità posizione
            if (this.isValidWaypointPosition(testX, testZ, animal)) {
                const testY = this.getHeightAtPosition(testX, testZ);
                return new THREE.Vector3(testX, testY, testZ);
            }
        }
        
        return null;
    }

    // =============================================
    // VALIDAZIONE WAYPOINT
    // =============================================

    isValidWaypointPosition(x, z, animal) {
        const groundHeight = this.getHeightAtPosition(x, z);
        const slope = this.getTerrainSlope ? this.getTerrainSlope(x, z) : 0;
        const currentHeight = animal.position.y;
        
        // Criteri di validità
        const heightDifference = Math.abs(groundHeight - currentHeight);
        const isReasonableHeight = heightDifference < 5; // Non troppo alto/basso
        const isNotTooSteep = slope < 0.4; // Pendenza accettabile
        const isAboveWater = groundHeight > 0; // Sopra livello acqua
        
        return isReasonableHeight && isNotTooSteep && isAboveWater;
    }

    // =============================================
    // SMOOTH MOVEMENT HELPER
    // =============================================

    smoothDirectionChange(currentDirection, targetDirection, smoothFactor = 0.1) {
        return new THREE.Vector3()
            .lerpVectors(currentDirection, targetDirection, smoothFactor);
    }   
    
    // =============================================
    // FISICA
    // =============================================
    
    updateAnimalPhysics(animal) {        
        // Applica forze
        animal.velocity.add(animal.acceleration);
        
        // Gravità per animali terrestri
        if (animal.data.behavior !== 'flying') {
            animal.velocity.y -= 0.02;
        }
        
        // Attrito dinamico basato su pendenza
        const slope = this.getTerrainSlope ? this.getTerrainSlope(animal.position.x, animal.position.z) : 0;
        const frictionFactor = 0.95 - (slope * 0.1); // Più attrito su pendenze
        animal.velocity.multiplyScalar(Math.max(0.85, frictionFactor));
        
        // Limita velocità
        const maxSpeed = animal.data.speed * 1.3;
        if (animal.velocity.length() > maxSpeed) {
            animal.velocity.normalize().multiplyScalar(maxSpeed);
        }
        
        // Aggiorna posizione
        animal.position.add(animal.velocity);
        
        // Collision detection
        const groundHeight = this.getHeightAtPosition(animal.position.x, animal.position.z);
        
        if (animal.position.y <= groundHeight) {
            animal.position.y = groundHeight;
            animal.velocity.y = Math.max(0, animal.velocity.y);
            animal.onGround = true;
        } else {
            animal.onGround = false;
        }
        
        // Stabilizzazione su pendenze
        if (slope > 0.3 && animal.onGround) {
            // Applica forza anti-scivolamento
            const slopeDirection = this.getSlopeDirection(animal.position.x, animal.position.z);
            if (slopeDirection) {
                const antiSlipForce = slopeDirection.multiplyScalar(-slope * 0.1);
                animal.velocity.add(antiSlipForce);
            }
        }
        
        // Aggiorna mesh position
        animal.mesh.position.copy(animal.position);
        
        // Orienta verso direzione movimento con smoothing
        if (animal.velocity.length() > 0.01) {
            const lookDirection = animal.velocity.clone().normalize();
            const currentRotation = animal.mesh.rotation.y;
            const targetRotation = Math.atan2(lookDirection.x, lookDirection.z);
            
            // Smooth rotation
            const rotationDiff = targetRotation - currentRotation;
            const smoothedRotation = currentRotation + rotationDiff * 0.1;
            animal.mesh.rotation.y = smoothedRotation;
        }
        
        // Controllo se bloccato
        if (animal.position.distanceTo(animal.lastPosition) < 0.1) {
            animal.stuckTimer++;
            if (animal.stuckTimer > 60) {
                // Reset waypoint per animali che vagano
                if (animal.wanderState) {
                    animal.wanderState.waypoint = null;
                }
                
                // Forza movimento casuale
                const randomDirection = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    0,
                    (Math.random() - 0.5) * 2
                ).normalize();
                animal.velocity.add(randomDirection.multiplyScalar(animal.data.speed));
                animal.stuckTimer = 0;
            }
        } else {
            animal.stuckTimer = 0;
        }
        
        animal.lastPosition.copy(animal.position);
    }

    // =============================================
    // HELPER PER DIREZIONE PENDENZA
    // =============================================

    getSlopeDirection(x, z) {
        const offset = 1;
        const h1 = this.getHeightAtPosition(x - offset, z);
        const h2 = this.getHeightAtPosition(x + offset, z);
        const h3 = this.getHeightAtPosition(x, z - offset);
        const h4 = this.getHeightAtPosition(x, z + offset);
        
        const dx = (h2 - h1) / (offset * 2);
        const dz = (h4 - h3) / (offset * 2);
        
        if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return null;
        
        return new THREE.Vector3(dx, 0, dz).normalize();
    }
    
    // =============================================
    // ANIMAZIONE
    // =============================================
    
    updateAnimalAnimation(animal) {
        animal.animationTime += 0.1;
        
        const mesh = animal.mesh;
        const userData = mesh.userData;

        if (userData.type === 'wolf' && userData.isCustomModel) {
            this.updateWolfCustomAnimation(animal);
            return; // Esci qui per i lupi custom
        }
    }
    
    
    // =============================================
    // SISTEMA BIOLOGICO
    // =============================================
    
    updateAnimalBiology(animal) {
        animal.age++;
        
        // Consumo energia/risorse base
        animal.energy = Math.max(0, animal.energy - 0.02);
        animal.thirst = Math.max(0, animal.thirst - 0.05);
        animal.hunger = Math.max(0, animal.hunger - 0.03);
        
        // Effetti della mancanza di risorse
        if (animal.energy < 20) {
            animal.health = Math.max(0, animal.health - 0.1);
        }
        
        if (animal.thirst < 10) {
            animal.health = Math.max(0, animal.health - 0.2);
        }
        
        if (animal.hunger < 10) {
            animal.health = Math.max(0, animal.health - 0.15);
        }
        
        // Recupero salute se ben nutrito
        if (animal.energy > 80 && animal.thirst > 80 && animal.hunger > 80) {
            animal.health = Math.min(animal.data.energy, animal.health + 0.05);
        }
        
        // Morte per età o salute
        if (animal.age > animal.maxAge || animal.health <= 0) {
            this.animalDeath(animal);
        }
    }
    
    animalDeath(animal) {
        console.log(`${animal.type} (${animal.id}) died at age ${animal.age}`);
        
        // Rimuovi animale
        this.removeAnimal(animal);
    }

    
    // =============================================
    // GESTIONE POPOLAZIONE
    // =============================================
    
    managePopulation() {
        // Rimuovi animali troppo lontani
        for (let i = this.animals.length - 1; i >= 0; i--) {
            const animal = this.animals[i];
            const distance = animal.position.distanceTo(this.playerPosition);
            
            if (distance > this.config.despawnRadius) {
                this.removeAnimal(animal);
            }
        }
        
        if (!this.spawningPaused && this.animals.length < this.config.maxAnimals && Math.random() < this.config.spawnChance) {
            const types = Object.keys(this.animalTypes);
            const randomType = types[Math.floor(Math.random() * types.length)];
            
            const angle = Math.random() * Math.PI * 2;
            const distance = this.config.spawnRadius + Math.random() * 20;
            const x = this.playerPosition.x + Math.cos(angle) * distance;
            const z = this.playerPosition.z + Math.sin(angle) * distance;
            
            this.spawnAnimal(randomType, x, z);
        }
    }
    
    performCleanup() {
        // Cleanup periodico per ottimizzazione
        this.animals.forEach(animal => {            
            // Reset timer se bloccato troppo a lungo
            if (animal.stuckTimer > 300) {
                animal.stuckTimer = 0;
                animal.state = 'wander';
            }
        });
    }
    
    // =============================================
    // UTILITY
    // =============================================
    
    generateId() {
        return 'animal_' + Math.random().toString(36).substr(2, 9);
    }
    
    getAnimalById(id) {
        return this.animals.find(animal => animal.id === id);
    }
    
    getAnimalsByType(type) {
        return this.animals.filter(animal => animal.type === type);
    }
    
    getAnimalCount() {
        return this.animals.length;
    }
    
    getAnimalStats() {
        const stats = {};
        
        Object.keys(this.animalTypes).forEach(type => {
            stats[type] = this.getAnimalsByType(type).length;
        });
        
        return stats;
    }
    
    // =============================================
    // METODI PUBBLICI PER CONTROLLO
    // =============================================
    
    addAnimal(type, x, z) {
        return this.spawnAnimal(type, x, z);
    }
    
    removeAnimalById(id) {
        const animal = this.getAnimalById(id);
        if (animal) {
            this.removeAnimal(animal);
            return true;
        }
        return false;
    }
    
    setPlayerPosition(position) {
        this.playerPosition = position;
    }

    enable() {
        this.enabled = true;
        console.log('🦌 Animal system enabled');
    }

    disable() {
        this.enabled = false;
        console.log('🦌 Animal system disabled');
    }

    toggle() {
        this.enabled = !this.enabled;
        console.log(`🦌 Animal system ${this.enabled ? 'enabled' : 'disabled'}`);
        return this.enabled;
    }

    pauseSpawning() {
        this.spawningPaused = true;
        console.log('🦌 Animal spawning paused');
    }

    resumeSpawning() {
        this.spawningPaused = false;
        console.log('🦌 Animal spawning resumed');
    }

    removeAllAnimals() {
        console.log(`🦌 Removing ${this.animals.length} animals`);
        this.animals.forEach(animal => {
            this.scene.remove(animal.mesh);
        });
        this.animals = [];
        this.dispatchStatsUpdate();
    }

    dispatchStatsUpdate() {
        // Crea evento personalizzato
        const statsEvent = new CustomEvent('animalStatsChanged', {
            detail: {
                totalCount: this.animals.length,
                stats: this.getAnimalStats(),
                timestamp: Date.now()
            }
        });
        
        // Dispatch evento
        document.dispatchEvent(statsEvent);
    }

    getSystemStatus() {
        return {
            enabled: this.enabled,
            spawningPaused: this.spawningPaused,
            animalCount: this.animals.length
        };
    }

    async loadWolfModel() {
        try {
            const gltf = await this.modelLoader.loadAsync('./models/wolf/scene.gltf');
            this.wolfModelTemplate = gltf.scene; // Salva come template
            
            // Extract animations if present
            this.wolfAnimations = gltf.animations || [];
            
            // Find the actual mesh and bones
            this.setupWolfModelData();
            this.spawnAnimal('wolf', 0,-44.01567923577642)
            
            console.log('🐺 Wolf model template loaded successfully');
        } catch (error) {
            console.log('⚠️ Wolf model loading failed:', error);
            this.wolfModelTemplate = null;
        }
    }

    createWolfFromModel(animalData) {
        console.log('🐺 Creating wolf from model...');
        
        if (!this.wolfModelTemplate) {
            console.log('❌ No wolf model template available, using procedural');
            return this.createAnimalMesh('wolf', animalData);
        }
        
        // CLONA DAL TEMPLATE PER OGNI LUPO
        const wolfMesh = SkeletonUtils.clone(this.wolfModelTemplate);

        // Reset posizione e rotazione
        wolfMesh.position.set(0, 0, 0);
        wolfMesh.rotation.set(0, 0, 0);
        
        // Scala il modello
        wolfMesh.scale.setScalar(animalData.size);
        
        // Setup shadows
        wolfMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Find and store bone references
        this.setupWolfBoneReferences(wolfMesh, wolfMesh);
        
        console.log('🐺 Wolf model cloned and configured successfully');
        return wolfMesh;
    }

    setupWolfModelData() {
        if (!this.wolfModelTemplate) return;
        
        // Find the skinned mesh
        this.wolfModelTemplate.traverse((child) => {
            if (child.isSkinnedMesh) {
                this.wolfSkinnedMesh = child;
                this.wolfSkeleton = child.skeleton;
                console.log('🦴 Found skeleton with', child.skeleton.bones.length, 'bones');
            }
        });
        
        // Log all bone names for debugging
        if (this.wolfSkeleton) {
            console.log('🦴 Bone names:');
            let bones = []
            this.wolfSkeleton.bones.forEach((bone, index) => {
            bones.push({ index, name: bone.name });
            });
            console.log(bones);
        }
    }

    updateWolfCustomAnimation(animal) {
        const mesh = animal.mesh;
        const bones = mesh.userData.bones;
        const time = animal.animationTime;
        const isMoving = animal.velocity.length() > 0.01;
        const speed = animal.velocity.length();
        
        if (!bones) return;
        
        // Initialize walk cycle if not exists
        if (animal.walkCycle === undefined) {
            animal.walkCycle = 0;
            animal.bodyWave = 0;
        }
        
        // === ANIMAZIONE CORPO ===
        this.animateWolfBody(animal, bones, time, isMoving, speed);
        
        // === ANIMAZIONE ZAMPE ===
        if (isMoving) {
            this.animateWolfLegs(animal, bones, speed);
        } else {
            this.animateWolfIdle(animal, bones, time);
        }
        
        // === ANIMAZIONE TESTA E CODA ===
        this.animateWolfHeadAndTail(animal, bones, time, isMoving);
    }

    animateWolfBody(animal, bones, time, isMoving, speed) {
        const normalizedSpeed = Math.min(speed / animal.data.speed, 1);
        
        // Movimento del corpo durante la camminata
        if (isMoving) {
            animal.bodyWave += normalizedSpeed * 0.2;
            
            // Spine1 - movimento principale del corpo
            if (bones.spine1) {
                const defaultRot = bones.spine1.userData.defaultRotation;
                // Movimento laterale durante la camminata
                bones.spine1.rotation.y = defaultRot.y + Math.sin(animal.bodyWave) * 0.08 * normalizedSpeed;
                // Leggero movimento verticale  
                bones.spine1.rotation.z = defaultRot.z + Math.sin(animal.bodyWave * 0.5) * 0.04 * normalizedSpeed;
                bones.spine1.rotation.x = defaultRot.x; // Mantieni default per x
            }
            
            // Chest - movimento secondario
            if (bones.chest) {
                const defaultRot = bones.chest.userData.defaultRotation;
                // Movimento opposto alla spine per naturalezza
                bones.chest.rotation.y = defaultRot.y + Math.sin(animal.bodyWave + Math.PI * 0.3) * 0.05 * normalizedSpeed;
                bones.chest.rotation.z = defaultRot.z + Math.sin(animal.bodyWave * 0.7) * 0.03 * normalizedSpeed;
                bones.chest.rotation.x = defaultRot.x; // Mantieni default per x
            }
        } else {
            // Movimento di respirazione quando fermo
            const breathingIntensity = 0.02;
            const breathingSpeed = 0.8;
            
            if (bones.spine1) {
                const defaultRot = bones.spine1.userData.defaultRotation;
                bones.spine1.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z + Math.sin(time * breathingSpeed) * breathingIntensity);
            }
            
            if (bones.chest) {
                const defaultRot = bones.chest.userData.defaultRotation;
                bones.chest.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z + Math.sin(time * breathingSpeed + Math.PI * 0.3) * breathingIntensity * 0.7);
            }
        }
    }

    // Animazione delle zampe durante la camminata
    animateWolfLegs(animal, bones, speed) {
        const normalizedSpeed = Math.min(speed / animal.data.speed, 1);
        const walkSpeed = 0.15 + (normalizedSpeed * 0.1); // Velocità adattiva
        
        animal.walkCycle += walkSpeed;
        
        // Pattern di camminata quadrupede realistico
        // Fase: Front Left -> Back Right -> Front Right -> Back Left
        const phases = {
            frontLeft: animal.walkCycle,
            frontRight: animal.walkCycle + Math.PI,
            backLeft: animal.walkCycle + Math.PI * 0.5,
            backRight: animal.walkCycle + Math.PI * 1.5
        };
        
        // Animazione zampe anteriori
        this.animateFrontLeg(bones.frontRumpL, bones.frontHipL, bones.frontKneeL, bones.frontAnkleL, bones.frontToes1L, phases.frontLeft, 'left');
        this.animateFrontLeg(bones.frontRumpR, bones.frontHipR, bones.frontKneeR, bones.frontAnkleR, bones.frontToes1R, phases.frontRight, 'right');
        
        // Animazione zampe posteriori
        this.animateBackLeg(bones.backHipL, bones.backKneeL, bones.backAnkleL, bones.backToes1L, phases.backLeft, 'left');
        this.animateBackLeg(bones.backHipR, bones.backKneeR, bones.backAnkleR, bones.backToes1R, phases.backRight, 'right');
    }

    // Animazione specifica per zampe anteriori - ASSE Z per movimento principale
    animateFrontLeg(rump, hip, knee, ankle, toes, phase, side) {
        const stepRange = 0.4;        // Range di movimento per il passo
        const kneeFlexion = 0.3;     // Flessione del ginocchio
        const ankleCompensation = 0.2; // Compensazione caviglia
        
        const sideMultiplier = side === 'left' ? 1 : -1;
        const sinValue = Math.sin(phase);
        
        // Movimento del rump (spalla) - leggero movimento di supporto
        if (rump) {
            const defaultRot = rump.userData.defaultRotation;
            if (defaultRot) {
                rump.rotation.x = defaultRot.x;
                rump.rotation.y = defaultRot.y;
                // Leggero movimento rotatorio della spalla
                rump.rotation.z = defaultRot.z + sinValue * 0.08 * sideMultiplier;
            }
        }
        
        // Movimento del hip (braccio) - MOVIMENTO PRINCIPALE SU ASSE Z
        if (hip) {
            const defaultRot = hip.userData.defaultRotation;
            if (defaultRot) {
                hip.rotation.x = defaultRot.x;
                hip.rotation.y = defaultRot.y;
                // Movimento principale avanti/indietro lungo Z
                hip.rotation.z = defaultRot.z + sinValue * stepRange;
            }
        }
        
        // Movimento del knee (gomito) - FLESSIONE SU ASSE Z
        if (knee) {
            const defaultRot = knee.userData.defaultRotation;
            if (defaultRot) {
                knee.rotation.x = defaultRot.x;
                knee.rotation.y = defaultRot.y;
                // Flessione del ginocchio durante il sollevamento
                const flexion = Math.max(0, sinValue) * kneeFlexion;
                knee.rotation.z = defaultRot.z + flexion;
            }
        }
        
        // Movimento dell'ankle (polso) - COMPENSAZIONE SU ASSE Z
        if (ankle) {
            const defaultRot = ankle.userData.defaultRotation;
            if (defaultRot) {
                ankle.rotation.x = defaultRot.x;
                ankle.rotation.y = defaultRot.y;
                // Compensazione per mantenere la zampa dritta
                const compensation = Math.max(0, sinValue) * ankleCompensation;
                ankle.rotation.z = defaultRot.z - compensation;
            }
        }
        
        // Movimento delle dita - FLESSIONE SU ASSE Z
        if (toes) {
            const defaultRot = toes.userData.defaultRotation;
            if (defaultRot) {
                toes.rotation.x = defaultRot.x;
                toes.rotation.y = defaultRot.y;
                // Leggera flessione durante il contatto con il suolo
                const toeFlex = Math.max(0, -sinValue) * 0.15;
                toes.rotation.z = defaultRot.z + toeFlex;
            }
        }
    }

    // Animazione specifica per zampe posteriori - ASSE Z per movimento principale
    animateBackLeg(hip, knee, ankle, toes, phase, side) {
        const stepRange = 0.5;        // Range di movimento per il passo (più ampio delle anteriori)
        const kneeFlexion = 0.4;     // Flessione del ginocchio
        const ankleCompensation = 0.3; // Compensazione caviglia
        
        const sinValue = Math.sin(phase);
        
        // Movimento del hip (anca) - MOVIMENTO PRINCIPALE SU ASSE Z
        if (hip) {
            const defaultRot = hip.userData.defaultRotation;
            if (defaultRot) {
                hip.rotation.x = defaultRot.x;
                hip.rotation.y = defaultRot.y;
                // Movimento principale avanti/indietro lungo Z (più ampio delle zampe anteriori)
                hip.rotation.z = defaultRot.z + sinValue * stepRange;
            }
        }
        
        // Movimento del knee (ginocchio) - FLESSIONE SU ASSE Z  
        if (knee) {
            const defaultRot = knee.userData.defaultRotation;
            if (defaultRot) {
                knee.rotation.x = defaultRot.x;
                knee.rotation.y = defaultRot.y;
                // Flessione più pronunciata per le zampe posteriori
                const flexion = Math.max(0, sinValue) * kneeFlexion;
                knee.rotation.z = defaultRot.z + flexion;
            }
        }
        
        // Movimento dell'ankle (caviglia) - COMPENSAZIONE SU ASSE Z
        if (ankle) {
            const defaultRot = ankle.userData.defaultRotation;
            if (defaultRot) {
                ankle.rotation.x = defaultRot.x;
                ankle.rotation.y = defaultRot.y;
                // Compensazione per il movimento naturale
                const compensation = Math.max(0, sinValue) * ankleCompensation;
                ankle.rotation.z = defaultRot.z - compensation;
            }
        }
        
        // Movimento delle dita - FLESSIONE SU ASSE Z
        if (toes) {
            const defaultRot = toes.userData.defaultRotation;
            if (defaultRot) {
                toes.rotation.x = defaultRot.x;
                toes.rotation.y = defaultRot.y;
                // Spinta durante il contatto con il suolo
                const toeFlex = Math.max(0, -sinValue) * 0.2;
                toes.rotation.z = defaultRot.z + toeFlex;
            }
        }
    }

    // Animazione quando il lupo è fermo - ASSE Z per movimento principale
    animateWolfIdle(bones, time) {
        const idleIntensity = 0.02;  // Ridotto per maggiore sottilità
        const idleSpeed = 0.3;
        
        // Leggero movimento delle zampe durante l'idle
        const idlePhase = Math.sin(time * idleSpeed) * idleIntensity;
        
        // Zampe anteriori - movimento su asse Z
        if (bones.frontHipL) {
            const defaultRot = bones.frontHipL.userData.defaultRotation;
            if (defaultRot) {
                bones.frontHipL.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z + idlePhase);
            }
        }
        if (bones.frontHipR) {
            const defaultRot = bones.frontHipR.userData.defaultRotation;
            if (defaultRot) {
                bones.frontHipR.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z - idlePhase);
            }
        }
        
        // Zampe posteriori - movimento su asse Z
        if (bones.backHipL) {
            const defaultRot = bones.backHipL.userData.defaultRotation;
            if (defaultRot) {
                bones.backHipL.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z - idlePhase * 0.5);
            }
        }
        if (bones.backHipR) {
            const defaultRot = bones.backHipR.userData.defaultRotation;
            if (defaultRot) {
                bones.backHipR.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z + idlePhase * 0.5);
            }
        }
        
        // Weight shifting per il corpo
        const weightShift = Math.sin(time * 0.1) * 0.01;
        if (bones.spine1) {
            const defaultRot = bones.spine1.userData.defaultRotation;
            if (defaultRot) {
                bones.spine1.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z + weightShift);
            }
        }
    }

    // Animazione testa e coda
    animateWolfHeadAndTail(animal, bones, time, isMoving) {
        // Testa - movimento naturale
        if (bones.head) {
            // Movimento di osservazione
            bones.head.rotation.y = Math.sin(time * 0.3) * 0.2;
            
            // Leggero movimento verticale durante la camminata
            if (isMoving) {
                bones.head.rotation.x = Math.sin(animal.walkCycle * 2) * 0.1;
            }
        }
        
        // Coda - movimento fluido
        if (bones.tail0) {
            const tailSpeed = isMoving ? 2 : 1;
            const tailIntensity = isMoving ? 0.6 : 0.3;
            
            bones.tail0.rotation.y = Math.sin(time * tailSpeed) * tailIntensity;
            bones.tail0.rotation.z = Math.sin(time * tailSpeed * 0.7) * tailIntensity * 0.5;
        }
        
        // Propagazione del movimento della coda
        if (bones.tail1) {
            bones.tail1.rotation.y = Math.sin(time * 2.2) * 0.4;
        }
        if (bones.tail2) {
            bones.tail2.rotation.y = Math.sin(time * 2.5) * 0.3;
        }
        if (bones.tail3) {
            bones.tail3.rotation.y = Math.sin(time * 2.8) * 0.2;
        }
    }

    // Metodo per aggiustare la velocità dell'animazione in base al movimento
    adjustAnimationSpeed(animal, bones, speed) {
        const normalizedSpeed = Math.min(speed / animal.data.speed, 1);
        
        // Adatta la velocità dell'animazione alla velocità di movimento
        if (normalizedSpeed > 0.8) {
            // Corsa - movimenti più rapidi e ampi
            return {
                walkSpeedMultiplier: 1.5,
                stepIntensity: 1.3,
                bodyMovement: 1.2
            };
        } else if (normalizedSpeed > 0.4) {
            // Camminata normale
            return {
                walkSpeedMultiplier: 1.0,
                stepIntensity: 1.0,
                bodyMovement: 1.0
            };
        } else {
            // Camminata lenta
            return {
                walkSpeedMultiplier: 0.7,
                stepIntensity: 0.8,
                bodyMovement: 0.8
            };
        }
    }

    setupWolfBoneReferences(group, mesh) {
        const bones = {};

        mesh.traverse((child) => {
            if (child.isBone) {
                const boneName = child.name;
                
                // Map your model's bones to animation functions
                switch(boneName) {
                    // HEAD AND NECK
                    case 'Head_M_034':
                        bones.head = child;
                        break;
                    case 'Neck_M_029':
                        bones.neck = child;
                        break;
                    case 'Neck1_M_030':
                        bones.neck1 = child;
                        break;
                    case 'Jaw_M_037':
                        bones.jaw = child;
                        break;
                    
                    // BODY
                    case 'Root_M_01':
                        bones.root = child;
                        break;
                    case 'Spine1_M_013':
                        bones.spine1 = child;
                        break;
                    case 'Chest_M_014':
                        bones.chest = child;
                        break;
                    
                    // FRONT LEGS
                    case 'frontRump_L_015':
                        bones.frontRumpL = child;
                        break;
                    case 'frontHip_L_016':
                        bones.frontHipL = child;
                        break;
                    case 'frontKnee_L_017':
                        bones.frontKneeL = child;
                        break;
                    case 'frontAnkle_L_018':
                        bones.frontAnkleL = child;
                        break;
                    case 'frontToes1_L_019':
                        bones.frontToes1L = child;
                        break;
                        
                    case 'frontRump_R_022':
                        bones.frontRumpR = child;
                        break;
                    case 'frontHip_R_023':
                        bones.frontHipR = child;
                        break;
                    case 'frontKnee_R_024':
                        bones.frontKneeR = child;
                        break;
                    case 'frontAnkle_R_025':
                        bones.frontAnkleR = child;
                        break;
                    case 'frontToes1_R_026':
                        bones.frontToes1R = child;
                        break;
                    
                    // BACK LEGS
                    case 'backHip_L_02':
                        bones.backHipL = child;
                        break;
                    case 'backKnee_L_03':
                        bones.backKneeL = child;
                        break;
                    case 'backAnkle_L_04':
                        bones.backAnkleL = child;
                        break;
                    case 'backToes1_L_00':
                        bones.backToes1L = child;
                        break;
                        
                    case 'backHip_R_07':
                        bones.backHipR = child;
                        break;
                    case 'backKnee_R_08':
                        bones.backKneeR = child;
                        break;
                    case 'backAnkle_R_09':
                        bones.backAnkleR = child;
                        break;
                    case 'backToes1_R_010':
                        bones.backToes1R = child;
                        break;
                    
                    // TAIL
                    case 'Tail0_M_047':
                        bones.tail0 = child;
                        break;
                    case 'Tail1_M_048':
                        bones.tail1 = child;
                        break;
                    case 'Tail2_M_049':
                        bones.tail2 = child;
                        break;
                    case 'Tail3_M_050':
                        bones.tail3 = child;
                        break;
                    case 'Tail4_M_051':
                        bones.tail4 = child;
                        break;
                    case 'Tail5_M_052':
                        bones.tail5 = child;
                        break;
                    
                    // EYES
                    case 'Eye_L_035':
                        bones.eyeL = child;
                        break;
                    case 'Eye_R_036':
                        bones.eyeR = child;
                        break;
                }
            }
        });
        
        // Store bone references and initialize default rotations
        group.userData.bones = bones;
        group.userData.type = 'wolf';
        group.userData.isCustomModel = true;
        
        // Inizializza le rotazioni di default e salva le originali
        this.initializeWolfDefaultRotations(bones);
        
        console.log('🦴 Mapped bones:', Object.keys(bones));
    }

    initializeWolfDefaultRotations(bones) {
        const boneMap = {
            root: 'root',
            backHipL: 'backHipL',
            backKneeL: 'backKneeL', 
            backAnkleL: 'backAnkleL',
            backToes1L: 'backToes1L',
            backHipR: 'backHipR',
            backKneeR: 'backKneeR',
            backAnkleR: 'backAnkleR',
            backToes1R: 'backToes1R',
            spine1: 'spine1',
            chest: 'chest',
            frontRumpL: 'frontRumpL',
            frontHipL: 'frontHipL',
            frontKneeL: 'frontKneeL',
            frontAnkleL: 'frontAnkleL',
            frontToes1L: 'frontToes1L',
            frontRumpR: 'frontRumpR',
            frontHipR: 'frontHipR',
            frontKneeR: 'frontKneeR',
            frontAnkleR: 'frontAnkleR',
            frontToes1R: 'frontToes1R',
            neck: 'neck',
            neck1: 'neck1',
            head: 'head',
            eyeL: 'eyeL',
            eyeR: 'eyeR',
            jaw: 'jaw',
            tail0: 'tail0',
            tail1: 'tail1',
            tail2: 'tail2',
            tail3: 'tail3',
            tail4: 'tail4',
            tail5: 'tail5'
        };
        
        // Applica le rotazioni di default e salva le originali
        Object.entries(boneMap).forEach(([defaultKey, boneKey]) => {
            const bone = bones[boneKey];
            const defaultRot = DEFAULT_ROTATIONS[defaultKey];
            
            if (bone && defaultRot) {
                // Salva la rotazione originale del modello
                bone.userData.originalRotation = {
                    x: bone.rotation.x,
                    y: bone.rotation.y,
                    z: bone.rotation.z
                };
                
                // Salva la rotazione di default per l'animazione
                bone.userData.defaultRotation = {
                    x: defaultRot.x,
                    y: defaultRot.y,
                    z: defaultRot.z
                };
                
                // Imposta la rotazione di default
                bone.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z);
            }
        });
    }

    // Metodo aggiuntivo per resettare alle rotazioni di default
    resetWolfToDefaultPose(animal) {
        const bones = animal.mesh.userData.bones;
        if (!bones) return;
        
        // Reset a tutte le rotazioni di default
        Object.values(bones).forEach(bone => {
            if (bone && bone.userData.defaultRotation) {
                const defaultRot = bone.userData.defaultRotation;
                bone.rotation.set(defaultRot.x, defaultRot.y, defaultRot.z);
            }
        });
        
        // Rimuovi la pose personalizzata
        delete animal.customPose;
        delete animal.poseStartTime;
        
        console.log('🐺 Wolf reset to default pose');
    }

    createWolfHowlAnimation(animal) {
        const bones = animal.mesh.userData.bones;
        if (!bones) return;
        
        const howlDuration = 180; // 3 seconds at 60fps
        let howlFrame = 0;
        
        // Salva le posizioni originali per il reset
        const originalRotations = {};
        
        if (bones.head) {
            originalRotations.head = bones.head.rotation.z;
        }
        if (bones.neck) {
            originalRotations.neck = bones.neck.rotation.z;
        }
        if (bones.neck1) {
            originalRotations.neck1 = bones.neck1.rotation.z;
        }
        if (bones.jaw) {
            originalRotations.jaw = bones.jaw.rotation.z;
        }
        
        // Target finali in radianti
        const headTargetRotation = -121.39 * (Math.PI / 180); // -2.119 radianti
        const neckTargetRotation = -31.66 * (Math.PI / 180); // -0.552 radianti
        const neck1TargetRotation = -44.49 * (Math.PI / 180); // -0.777 radianti
        const jawTargetRotation = 140 * (Math.PI / 180); // 2.443 radianti
        this.enabled = false;

        const animateHowl = () => {
            const progress = howlFrame / howlDuration;
            const intensity = Math.sin(progress * Math.PI);
            
            // Head up for howling - da -91.99° a -121.39° (movimento di -29.40°)
            if (bones.head) {
                bones.head.rotation.z = originalRotations.head + (headTargetRotation - originalRotations.head) * intensity;
            }
            
            // Neck extended - movimenti relativi alle posizioni originarie
            if (bones.neck) {
                bones.neck.rotation.z = originalRotations.neck + (neckTargetRotation - originalRotations.neck) * intensity;
            }
            if (bones.neck1) {
                bones.neck1.rotation.z = originalRotations.neck1 + (neck1TargetRotation - originalRotations.neck1) * intensity;
            }
            
            // Jaw movement - dalla posizione iniziale (144.51°) raggiunge 140°
            if (bones.jaw) {
                let jawIntensity;
                if (progress < 0.3) {
                    // Chiusura rapida nei primi 30% dell'animazione
                    jawIntensity = progress / 0.3;
                } else if (progress < 0.7) {
                    // Resta chiusa tra 30% e 70% (apice dell'ululato)
                    jawIntensity = 1;
                } else {
                    // Ritorno graduale alla posizione iniziale negli ultimi 30%
                    jawIntensity = 1 - ((progress - 0.7) / 0.3);
                }
                // Interpolazione tra posizione iniziale e target (140°)
                bones.jaw.rotation.z = originalRotations.jaw + (jawTargetRotation - originalRotations.jaw) * jawIntensity;
            }
        
            
            howlFrame++;
            if (howlFrame < howlDuration) {
                requestAnimationFrame(animateHowl);
            } else {
                // Reset finale - ritorna alle posizioni originali
                if (bones.head) {
                    bones.head.rotation.z = originalRotations.head;
                }
                if (bones.neck) {
                    bones.neck.rotation.z = originalRotations.neck;
                }
                if (bones.neck1) {
                    bones.neck1.rotation.z = originalRotations.neck1;
                }
                if (bones.jaw) {
                    bones.jaw.rotation.z = originalRotations.jaw;
                }
                this.enabled = true; // Riabilita l'animazione
            }
        };
        
        animateHowl();
    }

    testWolfModel() {
        if (!this.wolfModelTemplate) {
            console.log('❌ No wolf model loaded');
            return;
        }
        
        console.log('🐺 Testing wolf model...');
        
        // Spawn in front of the player
        const x = this.playerPosition.x + 10;
        const z = this.playerPosition.z;
        
        const testWolf = this.spawnAnimal('wolf', x, z);

        console.log('✅ Test wolf spawned at:', x.toFixed(1), z.toFixed(1), testWolf ? 'Success' : 'Failed');
    }
    
}

const DEFAULT_ROTATIONS = {
    root: { x: -3.1034933176415582, y: 1.5707963267948966, z: 0 },
    backHipL: { x: -3.132480311620482, y: -0.0748714971405041, z: 1.6920226293516183 },
    backKneeL: { x: -3.2261282117712133e-9, y: -1.516335897094139e-9, z: -0.9301783659440908 },
    backAnkleL: { x: -0.09614186404721094, y: 0.1163167192231867, z: 1.2889529939809432 },
    backToes1L: { x: 0.0150624752693944, y: -0.25973931819637347, z: -0.31929175055146625 },
    backHipR: { x: 3.1324803140958064, y: 0.07487149993483717, z: -1.4495700431388858 },
    backKneeR: { x: 3.3583415371648054e-9, y: -2.268320943895837e-9, z: -0.9301782273262498 },
    backAnkleR: { x: -0.09614181792945863, y: 0.11631668165246022, z: 1.2889528029863013 },
    backToes1R: { x: 0.015062494754291274, y: -0.2597392948794152, z: -0.3192918408543411 },
    spine1: { x: 9.429189356731592e-16, y: -5.747709787091168e-17, z: -0.08488530743365742 },
    chest: { x: -1.3054387660506708e-15, y: -5.752845463861439e-17, z: 0.3109412667146041 },
    frontRumpL: { x: 3.14159265358978, y: -1.5806940509357496e-14, z: 2.431526196773283 },
    frontHipL: { x: -6.777561459124582e-9, y: 2.702972236586471e-8, z: -1.3251168187969566 },
    frontKneeL: { x: -9.721706221667051e-18, y: 9.461728258180827e-17, z: 1.0029693626587344 },
    frontAnkleL: { x: 1.2592198483475997e-7, y: -7.47861828939207e-8, z: -0.5359287181886885 },
    frontToes1L: { x: -2.212834232260714e-8, y: -2.560732329750159e-8, z: 0.8581496322866788 },
    frontRumpR: { x: -3.14159265358978, y: -1.1001445916797675e-14, z: -0.7100665500064989 },
    frontHipR: { x: -2.925622844358581e-17, y: 8.962503631924123e-17, z: -1.3251168187969566 },
    frontKneeR: { x: 2.0834327055788672e-17, y: 6.492131377280196e-17, z: 1.0029696991689 },
    frontAnkleR: { x: 8.553609078063733e-8, y: -5.080064029016661e-8, z: -0.5359286526525814 },
    frontToes1R: { x: 2.7496121806959794e-8, y: 3.181900967259042e-8, z: 0.8581495593226528 },
    neck: { x: 5.994217541979441e-16, y: -1.1788759084298926e-16, z: -0.5490485978067806 },
    neck1: { x: 1.0134813285325595e-17, y: 1.0947678391831871e-17, z: -0.18310081871277348 },
    head: { x: -1.7482510708030807e-16, y: -4.4325363750173154e-16, z: -1.6054899208789626 },
    eyeL: { x: 0.563797285114181, y: 0.23115315662290073, z: 1.9184345547100532 },
    eyeR: { x: -0.563797285114181, y: -0.23115315662290073, z: 1.9184345547100532 },
    jaw: { x: -3.3961963057665796e-16, y: 1.1881437795985192e-17, z: 2.5221590379386303 },
    tail0: { x: 3.141592653589776, y: -3.013630483081121e-14, z: -2.098107928314069 },
    tail1: { x: -7.982698915319894e-17, y: 1.1344874127642993e-16, z: 0.3219431166701184 },
    tail2: { x: -9.325588668441151e-17, y: -2.4063281102618933e-16, z: 0.037641885761594954 },
    tail3: { x: -1.8449272580377104e-17, y: 2.7743043920739735e-16, z: -0.07423995657836936 },
    tail4: { x: 1.4934354453472532e-17, y: -9.069989885786129e-17, z: 0.02235154437540926 },
    tail5: { x: 6.91560650946385e-17, y: 7.238541110163125e-19, z: -0.3966285256592426 }
};