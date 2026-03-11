export const PRICING = {
    STARTER: {
        priceId: process.env.NEXT_PUBLIC_PRICE_ID_STARTER || "",
        pricePerSeat: 8,
        minSeats: 1,
    },
    SHIELD: {
        priceId: process.env.NEXT_PUBLIC_PRICE_ID_SHIELD || "",
        pricePerSeat: 15,
        minSeats: 1,
    }
}
