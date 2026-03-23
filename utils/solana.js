const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, SystemProgram } = require('@solana/web3.js');
const borsh = require('borsh');
const fs = require('fs');
const path = require('path');

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const secretKeyPath = path.resolve(__dirname, '../secret.json');

let payer;
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(secretKeyPath, 'utf-8')));
payer = Keypair.fromSecretKey(secretKey);

const MY_PROGRAM_ID = new PublicKey("58mhPm3r43RmifEcrAGdPAHMWTAd1fzWekRB9Sffh6zo");

// --- ESQUEMAS BORSH ---
class TruckInstruction {
    constructor(fields) {
        this.door_status = fields.door_status;
        this.last_event_hash = fields.last_event_hash;
        this.timestamp = fields.timestamp;
    }
}

class TruckState {
    constructor(fields) {
        this.is_initialized = fields.is_initialized;
        this.door_status = fields.door_status;
        this.last_event_hash = fields.last_event_hash;
        this.timestamp = fields.timestamp;
    }
}

const truckSchema = new Map([
    [TruckInstruction, {
        kind: 'struct',
        fields: [['door_status', 'u8'], ['last_event_hash', [32]], ['timestamp', 'u64']]
    }],
    [TruckState, {
        kind: 'struct',
        fields: [['is_initialized', 'u8'], ['door_status', 'u8'], ['last_event_hash', [32]], ['timestamp', 'u64']]
    }]
]);

// 1. ACTUALIZAR
const updateTruckOnChain = async (truckAccountPubkey, doorStatus, hashHex) => {
    try {
        const hashArray = Array.from(Buffer.from(hashHex, 'hex'));
        const timestamp = BigInt(Math.floor(Date.now() / 1000));
        const statusValue = doorStatus === "OPEN_FORCED" ? 2 : (doorStatus === "OPEN" ? 1 : 0);

        const instructionData = new TruckInstruction({
            door_status: statusValue,
            last_event_hash: hashArray,
            timestamp: timestamp
        });

        const dataBuffer = Buffer.from(borsh.serialize(truckSchema, instructionData));
        const { blockhash } = await connection.getLatestBlockhash();

        const transaction = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
            .add(new TransactionInstruction({
                keys: [
                    { pubkey: new PublicKey(truckAccountPubkey), isSigner: false, isWritable: true },
                    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
                ],
                programId: MY_PROGRAM_ID,
                data: dataBuffer,
            }));

        const signature = await connection.sendTransaction(transaction, [payer]);
        await connection.confirmTransaction(signature);
        return signature;
    } catch (error) {
        console.error("❌ Error en updateTruckOnChain:", error);
        throw error;
    }
};

// 2. CREAR CUENTA
const createTruckAccount = async () => {
    const truckAccount = Keypair.generate();
    const space = 42;
    const lamports = await connection.getMinimumBalanceForRentExemption(space);

    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: truckAccount.publicKey,
            lamports,
            space,
            programId: MY_PROGRAM_ID,
        })
    );

    const signature = await connection.sendTransaction(transaction, [payer, truckAccount]);
    await connection.confirmTransaction(signature);
    return truckAccount.publicKey.toBase58();
};

// 3. LEER ESTADO ACTUAL
const getTruckStateFromSolana = async (truckPubkey) => {
    try {
        const info = await connection.getAccountInfo(new PublicKey(truckPubkey));
        if (!info) return null;
        const state = borsh.deserialize(truckSchema, TruckState, info.data);
        return {
            ...state,
            last_event_hash: Buffer.from(state.last_event_hash).toString('hex'),
            timestamp: state.timestamp.toString()
        };
    } catch (error) {
        console.error("❌ Error leyendo de Solana:", error);
        return null;
    }
};

// 4. OBTENER HISTORIAL COMPLETO
const getTruckHistory = async (truckPubkey) => {
    try {
        const pubkey = new PublicKey(truckPubkey);
        const transactions = await connection.getSignaturesForAddress(pubkey);

        const history = await Promise.all(transactions.map(async (tx) => {
            const details = await connection.getTransaction(tx.signature, {
                maxSupportedTransactionVersion: 0
            });

            return {
                signature: tx.signature,
                slot: tx.slot,
                time: new Date(tx.blockTime * 1000).toLocaleString(),
                // Aquí podrías incluso decodificar los datos de la instrucción si lo necesitas
                status: tx.err ? "Error" : "Éxito"
            };
        }));

        return history;
    } catch (error) {
        console.error("❌ Error obteniendo historial:", error);
        return [];
    }
};

module.exports = { updateTruckOnChain, createTruckAccount, getTruckStateFromSolana, getTruckHistory };