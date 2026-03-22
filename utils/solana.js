const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const secretKeyPath = path.resolve(__dirname, '../secret.json');

let payer;
try {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(secretKeyPath, 'utf-8')));
    payer = Keypair.fromSecretKey(secretKey);
    console.log("✅ Llave cargada correctamente:", payer.publicKey.toBase58());
} catch (e) {
    console.error("❌ Error cargando secret.json");
}

/**
 * Registra el Hash en Solana usando el Contrato Custom en Rust
 */
const sendHashToSolana = async (hash) => {
    try {
        const myProgramId = new PublicKey("5spqT6JnBiG6WEJg8N1ibkW4kQqpYtpnFDsq6cUHCNLU");

        const { blockhash } = await connection.getLatestBlockhash('confirmed');

        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: payer.publicKey
        }).add(
            new TransactionInstruction({
                keys: [
                    { pubkey: payer.publicKey, isSigner: true, isWritable: true }
                ],
                programId: myProgramId,
                data: Buffer.from(hash),
            })
        );

        const signature = await connection.sendTransaction(transaction, [payer], { skipPreflight: true });
        await connection.confirmTransaction(signature, 'confirmed');
        return signature;
    } catch (error) {
        console.error("❌ Error en el proceso de Solana:", error);
        throw error;
    }
};

/**
 * Recupera el Hash de Solana para auditoría (Lectura de logs del Contrato Rust)
 */
const getHashFromSolana = async (signature) => {
    try {
        const tx = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (!tx) return null;

        const logMessages = tx.meta.logMessages;
        const customLog = logMessages.find(log => log.includes("✅ Hash Notariado exitosamente:"));

        return customLog;
    } catch (error) {
        console.error("❌ Error recuperando de Solana:", error);
        return null;
    }
};

module.exports = { sendHashToSolana, getHashFromSolana };