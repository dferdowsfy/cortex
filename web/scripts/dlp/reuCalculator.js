/**
 * reuCalculator.js
 * 
 * Logic for calculating Risk Exposure Units (REU).
 * REU = Sensitivity Points (SP) × Exposure Multiplier (EM) × Destination Multiplier (DM)
 */

const EM_FACTORS = {
    blocked: 1.0,
    text_only: 2.0,
    attachment: 5.0,
    bulk: 10.0
};

const DM_FACTORS = {
    enterprise_approved: 0.5,
    business_saas: 1.0,
    public_ai: 2.0,
    unknown: 3.0,
    banned: 5.0
};

/**
 * Calculates REU based on the provided inputs.
 */
function calculateREU(sensitivityPoints, transmissionType, destinationType) {
    const em = EM_FACTORS[transmissionType] || 1.0;
    const dm = DM_FACTORS[destinationType] || 3.0;

    const finalReu = sensitivityPoints * em * dm;
    const explanation = `${sensitivityPoints} (SP) × ${em} (EM) × ${dm} (DM) = ${finalReu}`;

    return {
        finalReu,
        exposureMultiplier: em,
        destinationMultiplier: dm,
        explanation
    };
}

module.exports = { calculateREU };
