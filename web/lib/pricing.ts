export const PRICING = {
    STARTER: {
        priceId: process.env.NEXT_PUBLIC_PRICE_ID_STARTER || "",
        pricePerSeat: 8,
        minSeats: 25,
        totalMonthly: 8 * 25
    },
    SHIELD: {
        priceId: process.env.NEXT_PUBLIC_PRICE_ID_SHIELD || "",
        pricePerSeat: 15,
        minSeats: 25,
        totalMonthly: 15 * 25
    }
}
